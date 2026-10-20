/** Subtitle timing offset in ms: positive shows subtitles later, negative earlier. */

const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}\.\d{3})(\s+-->\s+)((?:\d+:)?\d{1,2}:\d{2}\.\d{3})(.*)$/;

function parseStamp(s: string): number {
  const parts = s.split(':');
  const secs = Number(parts[parts.length - 1]);
  const mins = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  return Math.round(((hours * 60 + mins) * 60 + secs) * 1000);
}

const pad = (n: number, width: number): string => {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
};

function formatStamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(total % 1000, 3)}`;
}

/** Shifts every cue timing line of a WebVTT text by `offsetMs`, clamping at 0. Everything else is left as is. */
export function shiftVtt(text: string, offsetMs: number): string {
  if (!offsetMs) return text;
  return text
    .split('\n')
    .map((line) => {
      const m = TIMING.exec(line.replace(/\r$/, ''));
      if (!m) return line;
      const cr = line.charAt(line.length - 1) === '\r' ? '\r' : '';
      return `${formatStamp(parseStamp(m[1]) + offsetMs)}${m[2]}${formatStamp(parseStamp(m[3]) + offsetMs)}${m[4]}${cr}`;
    })
    .join('\n');
}

/** "+0.5 s", "-1.2 s", "0.0 s". */
export function formatOffset(ms: number): string {
  const tenths = Math.round(ms / 100);
  if (tenths === 0) return '0.0 s';
  return `${tenths > 0 ? '+' : '-'}${(Math.abs(tenths) / 10).toFixed(1)} s`;
}
