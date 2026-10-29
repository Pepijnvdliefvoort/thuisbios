import { describe, expect, it } from 'vitest';
import { AUTOPLAY_CANCEL_PREFIX, DISCONNECT_TEXT, autoplayCancelCommand, SUBTITLE_OFFSET_PREFIX, disconnectCommand, playCommand, relativeSeekTicks, seekCommand, streamIndexCommand, subtitleOffsetCommand, transportCommand, viewCommand } from './commands';

describe('command URLs', () => {
  it('builds Play on TV', () => {
    expect(playCommand('S1', 'item 1', 123450000)).toEqual({
      method: 'POST',
      path: '/Sessions/S1/Playing?playCommand=PlayNow&itemIds=item%201&startPositionTicks=123450000',
    });
  });
  it('plays from the start with 0 ticks and never sends negative or fractional ticks', () => {
    expect(playCommand('S1', 'i', 0).path).toContain('startPositionTicks=0');
    expect(playCommand('S1', 'i', -5).path).toContain('startPositionTicks=0');
    expect(playCommand('S1', 'i', 10.6).path).toContain('startPositionTicks=11');
  });
  it('builds Show on TV with encoded name', () => {
    expect(viewCommand('S1', 'Movie', 'abc', 'Tom & Jerry').path).toBe(
      '/Sessions/S1/Viewing?itemType=Movie&itemId=abc&itemName=Tom%20%26%20Jerry',
    );
  });
  it('builds transport commands', () => {
    expect(transportCommand('S1', 'PlayPause').path).toBe('/Sessions/S1/Playing/PlayPause');
    expect(transportCommand('S1', 'NextTrack').path).toBe('/Sessions/S1/Playing/NextTrack');
    expect(transportCommand('S1', 'Stop').method).toBe('POST');
  });
  it('builds the disconnect message with a JSON body', () => {
    expect(disconnectCommand('S 1')).toEqual({
      method: 'POST',
      path: '/Sessions/S%201/Message',
      body: { Header: 'Thuisbios', Text: DISCONNECT_TEXT, TimeoutMs: 1000 },
    });
    expect(DISCONNECT_TEXT).toBe('thuisbios:disconnect');
  });
  it('builds the subtitle offset message with an absolute value', () => {
    expect(subtitleOffsetCommand('S 1', 'abc', -1200)).toEqual({
      method: 'POST',
      path: '/Sessions/S%201/Message',
      body: { Header: 'Thuisbios', Text: 'thuisbios:subtitle-offset:abc:-1200', TimeoutMs: 1000 },
    });
    expect(SUBTITLE_OFFSET_PREFIX).toBe('thuisbios:subtitle-offset:');
  });
  it('builds the autoplay cancel message', () => {
    expect(autoplayCancelCommand('S 1', 'abc')).toEqual({
      method: 'POST',
      path: '/Sessions/S%201/Message',
      body: { Header: 'Thuisbios', Text: 'thuisbios:autoplay-cancel:abc', TimeoutMs: 1000 },
    });
    expect(AUTOPLAY_CANCEL_PREFIX).toBe('thuisbios:autoplay-cancel:');
  });
  it('builds the standard audio and subtitle track commands with a string index', () => {
    expect(streamIndexCommand('S 1', 'SetAudioStreamIndex', 2)).toEqual({
      method: 'POST',
      path: '/Sessions/S%201/Command',
      body: { Name: 'SetAudioStreamIndex', Arguments: { Index: '2' } },
    });
    expect(streamIndexCommand('S1', 'SetSubtitleStreamIndex', -1).body).toEqual({
      Name: 'SetSubtitleStreamIndex',
      Arguments: { Index: '-1' },
    });
  });
  it('builds seek', () => {
    expect(seekCommand('S1', 600000000).path).toBe('/Sessions/S1/Playing/Seek?seekPositionTicks=600000000');
  });
});

describe('relativeSeekTicks', () => {
  const sec = 10_000_000;
  it('jumps by seconds', () => {
    expect(relativeSeekTicks(100 * sec, 10, 1000 * sec)).toBe(110 * sec);
    expect(relativeSeekTicks(100 * sec, -10, 1000 * sec)).toBe(90 * sec);
  });
  it('clamps to the start and the runtime', () => {
    expect(relativeSeekTicks(3 * sec, -10, 1000 * sec)).toBe(0);
    expect(relativeSeekTicks(995 * sec, 10, 1000 * sec)).toBe(1000 * sec);
    expect(relativeSeekTicks(995 * sec, 10)).toBe(1005 * sec);
  });
});
