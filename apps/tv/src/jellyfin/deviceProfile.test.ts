import { describe, expect, it } from 'vitest';
import { buildDeviceProfile } from './deviceProfile';

const profile = buildDeviceProfile();
const list = (s: string | undefined): string[] => (s ? s.split(',') : []);

describe('buildDeviceProfile', () => {
  it('direct plays mp4, mkv and ts', () => {
    const containers = profile.DirectPlayProfiles.filter((p) => p.Type === 'Video').flatMap((p) => list(p.Container));
    expect(containers).toEqual(expect.arrayContaining(['mp4', 'mkv', 'ts']));
  });

  it('allows h264, hevc and vp9 video but never av1', () => {
    for (const p of profile.DirectPlayProfiles.filter((x) => x.Type === 'Video')) {
      expect(list(p.VideoCodec)).toEqual(['h264', 'hevc', 'vp9']);
    }
  });

  it('allows aac, mp3, ac3 and eac3 audio but never dts or truehd', () => {
    const all = JSON.stringify(profile).toLowerCase();
    expect(all).not.toContain('dts');
    expect(all).not.toContain('truehd');
    expect(all).not.toContain('av1');
    for (const p of profile.DirectPlayProfiles.filter((x) => x.Type === 'Video')) {
      expect(list(p.AudioCodec)).toEqual(['aac', 'mp3', 'ac3', 'eac3']);
    }
  });

  it('transcodes to HLS with ts segments, h264/hevc video and aac/ac3 audio', () => {
    expect(profile.TranscodingProfiles).toHaveLength(1);
    const t = profile.TranscodingProfiles[0];
    expect(t).toMatchObject({ Type: 'Video', Container: 'ts', Protocol: 'hls', Context: 'Streaming' });
    expect(list(t.VideoCodec)).toEqual(['h264', 'hevc']);
    expect(list(t.AudioCodec)).toEqual(['aac', 'ac3']);
  });

  it('limits h264 to 8-bit and hevc to 10-bit', () => {
    const depth = (codec: string) =>
      profile.CodecProfiles.find((c) => c.Codec === codec)?.Conditions.find((c) => c.Property === 'VideoBitDepth');
    expect(depth('h264')).toMatchObject({ Condition: 'LessThanEqual', Value: '8' });
    expect(depth('hevc')).toMatchObject({ Condition: 'LessThanEqual', Value: '10' });
  });

  it('honours a custom bitrate and serialises to JSON', () => {
    expect(buildDeviceProfile({ maxStreamingBitrate: 8000000 }).MaxStreamingBitrate).toBe(8000000);
    expect(() => JSON.stringify(profile)).not.toThrow();
  });
});
