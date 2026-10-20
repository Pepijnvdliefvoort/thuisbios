import { describe, expect, it, vi } from 'vitest';
import { createUpnp, DEFAULT_CONTROL_PATH, parseControlUrl, soapBody, xmlValue } from './upnp.mjs';

const DESCRIPTION = `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device><serviceList>
<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/upnp/control/AVTransport1</controlURL></service>
<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId><controlURL>/upnp/control/RC2</controlURL></service>
</serviceList></device></root>`;

const answer = (tag: string, value: string) =>
  `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Resp xmlns:u="x"><${tag}>${value}</${tag}></u:Resp></s:Body></s:Envelope>`;

function fakeFetch(handlers: { description?: string | number; soap?: (action: string, body: string) => string | number }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const result = url.endsWith('/dmr')
      ? (handlers.description ?? 500)
      : handlers.soap!(String((init!.headers as Record<string, string>).SOAPAction), String(init!.body));
    if (typeof result === 'number') return { ok: false, status: result, text: async () => '' } as Response;
    return { ok: true, status: 200, text: async () => result } as Response;
  });
}

describe('upnp helpers', () => {
  it('builds a SOAP body', () => {
    const body = soapBody('SetVolume', { DesiredVolume: 14 });
    expect(body).toContain('<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">');
    expect(body).toContain('<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>14</DesiredVolume>');
  });

  it('reads values and the control URL', () => {
    expect(xmlValue(answer('CurrentVolume', ' 14 '), 'CurrentVolume')).toBe('14');
    expect(xmlValue('<a/>', 'CurrentVolume')).toBeNull();
    expect(parseControlUrl(DESCRIPTION)).toBe('/upnp/control/RC2');
    expect(parseControlUrl('<root/>')).toBeNull();
  });
});

describe('createUpnp', () => {
  it('uses the control URL from the description and sends the right action', async () => {
    const fetchFn = fakeFetch({ description: DESCRIPTION, soap: () => answer('CurrentVolume', '14') });
    const upnp = createUpnp({ host: '1.2.3.4', port: 9197, fetchFn: fetchFn as never });
    expect(await upnp.getVolume()).toBe(14);
    expect(await upnp.getVolume()).toBe(14);
    const urls = fetchFn.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['http://1.2.3.4:9197/dmr', 'http://1.2.3.4:9197/upnp/control/RC2', 'http://1.2.3.4:9197/upnp/control/RC2']);
    const init = fetchFn.mock.calls[1][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).SOAPAction).toBe('"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"');
  });

  it('falls back to the default control URL', async () => {
    const fetchFn = fakeFetch({ description: 404, soap: () => answer('CurrentMute', '1') });
    const upnp = createUpnp({ host: 'h', fetchFn: fetchFn as never });
    expect(await upnp.getMute()).toBe(true);
    expect(fetchFn.mock.calls[1][0]).toBe(`http://h:9197${DEFAULT_CONTROL_PATH}`);
  });

  it('sets the volume', async () => {
    const bodies: string[] = [];
    const fetchFn = fakeFetch({
      soap: (_a, body) => {
        bodies.push(body);
        return '<ok/>';
      },
    });
    await createUpnp({ host: 'h', fetchFn: fetchFn as never }).setVolume(33);
    expect(bodies[0]).toContain('<DesiredVolume>33</DesiredVolume>');
  });

  it('fails on HTTP errors, junk and network errors', async () => {
    await expect(createUpnp({ host: 'h', fetchFn: fakeFetch({ soap: () => 500 }) as never }).getVolume()).rejects.toThrow('HTTP 500');
    await expect(createUpnp({ host: 'h', fetchFn: fakeFetch({ soap: () => '<x/>' }) as never }).getVolume()).rejects.toThrow('CurrentVolume');
    await expect(
      createUpnp({ host: 'h', fetchFn: (async () => Promise.reject(new TypeError('refused'))) as never }).getVolume(),
    ).rejects.toThrow('refused');
  });
});
