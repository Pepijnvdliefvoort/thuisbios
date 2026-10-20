import { describe, expect, it } from 'vitest';
import { formatOffset, shiftVtt } from './subtitleOffset';

describe('shiftVtt', () => {
  const vtt = 'WEBVTT\n\nNOTE 00:00:01.000 --> 00:00:02.000\n\n1\n00:01:02.345 --> 00:01:04.000 align:start position:0%\nHello\n\n00:05.000 --> 00:06.500\nShort\n';

  it('returns the text unchanged for a zero offset', () => {
    expect(shiftVtt(vtt, 0)).toBe(vtt);
  });

  it('shifts long and short timing lines and keeps cue settings', () => {
    expect(shiftVtt(vtt, 500)).toBe(
      'WEBVTT\n\nNOTE 00:00:01.000 --> 00:00:02.000\n\n1\n00:01:02.845 --> 00:01:04.500 align:start position:0%\nHello\n\n00:00:05.500 --> 00:00:07.000\nShort\n',
    );
  });

  it('shifts earlier and clamps at zero', () => {
    expect(shiftVtt('00:00:01.000 --> 00:00:03.000\nx', -2000)).toBe('00:00:00.000 --> 00:00:01.000\nx');
    expect(shiftVtt('00:00:01.000 --> 00:00:03.000\nx', -5000)).toBe('00:00:00.000 --> 00:00:00.000\nx');
  });

  it('carries over hours and keeps CRLF line endings', () => {
    expect(shiftVtt('00:59:59.900 --> 01:00:00.000\r\nx\r\n', 200)).toBe('01:00:00.100 --> 01:00:00.200\r\nx\r\n');
  });
});

describe('formatOffset', () => {
  it('formats with a sign and one decimal', () => {
    expect(formatOffset(500)).toBe('+0.5 s');
    expect(formatOffset(-1200)).toBe('-1.2 s');
    expect(formatOffset(0)).toBe('0.0 s');
    expect(formatOffset(30)).toBe('0.0 s');
  });
});
