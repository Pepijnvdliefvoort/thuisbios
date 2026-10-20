/** Minimal UPnP/DLNA RenderingControl client for the TV's MediaRenderer (reads and sets the absolute volume). */

export const RENDERING_CONTROL = 'urn:schemas-upnp-org:service:RenderingControl:1';
export const DEFAULT_CONTROL_PATH = '/upnp/control/RenderingControl1';
export const UPNP_TIMEOUT_MS = 3_000;

/** Error thrown for any UPnP failure (network, timeout, HTTP error, unparsable answer). */
export class UpnpError extends Error {}

/** @param {string} value */
function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * SOAP request body for one RenderingControl action on instance 0.
 * @param {string} action
 * @param {Record<string, string | number>} [args] extra arguments after InstanceID and Channel
 */
export function soapBody(action, args = {}) {
  const inner = Object.entries({ InstanceID: 0, Channel: 'Master', ...args })
    .map(([name, value]) => `<${name}>${escapeXml(String(value))}</${name}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${RENDERING_CONTROL}">${inner}</u:${action}></s:Body></s:Envelope>`
  );
}

/** Text of the first `<tag>` in an XML string (namespace prefixes ignored), or null. */
export function xmlValue(xml, tag) {
  const match = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

/** The RenderingControl `controlURL` from the device description, or null. */
export function parseControlUrl(descriptionXml) {
  const services = descriptionXml.match(/<service>[\s\S]*?<\/service>/g) || [];
  for (const service of services) {
    const type = xmlValue(service, 'serviceType');
    if (type && type.startsWith('urn:schemas-upnp-org:service:RenderingControl:')) return xmlValue(service, 'controlURL');
  }
  return null;
}

/**
 * @param {{ host: string, port?: number, fetchFn?: typeof fetch, timeoutMs?: number }} options
 */
export function createUpnp({ host, port = 9197, fetchFn = fetch, timeoutMs = UPNP_TIMEOUT_MS }) {
  const base = `http://${host}:${port}`;
  /** @type {Promise<string> | null} */
  let controlUrl = null;

  /** @param {string} url @param {RequestInit} [init] */
  async function request(url, init = {}) {
    let response;
    try {
      response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new UpnpError(`request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!response.ok) throw new UpnpError(`HTTP ${response.status}`);
    return response.text();
  }

  /** Finds the control URL once; falls back to the usual Samsung path when the description is unusable. */
  function getControlUrl() {
    if (!controlUrl) {
      controlUrl = request(`${base}/dmr`).then(
        (xml) => new URL(parseControlUrl(xml) || DEFAULT_CONTROL_PATH, base).toString(),
        () => `${base}${DEFAULT_CONTROL_PATH}`,
      );
    }
    return controlUrl;
  }

  /** @param {string} action @param {Record<string, string | number>} [args] */
  async function soap(action, args) {
    const url = await getControlUrl();
    const xml = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${RENDERING_CONTROL}#${action}"` },
      body: soapBody(action, args),
    });
    return xml;
  }

  /** @param {string} xml @param {string} tag */
  function number(xml, tag) {
    const value = Number(xmlValue(xml, tag));
    if (xmlValue(xml, tag) === null || !Number.isFinite(value)) throw new UpnpError(`no ${tag} in answer`);
    return value;
  }

  return {
    /** @returns {Promise<number>} 0-100 */
    async getVolume() {
      return Math.min(100, Math.max(0, Math.round(number(await soap('GetVolume'), 'CurrentVolume'))));
    },
    /** @param {number} level 0-100 */
    async setVolume(level) {
      await soap('SetVolume', { DesiredVolume: level });
    },
    /** @returns {Promise<boolean>} */
    async getMute() {
      return number(await soap('GetMute'), 'CurrentMute') === 1;
    },
  };
}
