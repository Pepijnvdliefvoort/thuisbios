import { describe, expect, it } from 'vitest';
import { buildPhoneProfile } from './phoneProfile';

const none = () => false;
const all = () => true;

describe('buildPhoneProfile', () => {
  it('direct plays only h264 with aac/mp3 in mp4 when the browser reports nothing else', () => {
    const p = buildPhoneProfile(none);
    expect(p.DirectPlayProfiles).toEqual([
      { Type: 'Video', Container: 'mp4,m4v,mov', VideoCodec: 'h264', AudioCodec: 'aac,mp3' },
    ]);
  });

  it('adds hevc, surround audio, flac, opus and webm when supported', () => {
    const p = buildPhoneProfile(all);
    expect(p.DirectPlayProfiles[0].VideoCodec).toBe('h264,hevc');
    expect(p.DirectPlayProfiles[0].AudioCodec).toBe('aac,mp3,ac3,eac3,flac,opus');
    expect(p.DirectPlayProfiles[1]).toMatchObject({ Container: 'webm', VideoCodec: 'vp8,vp9' });
  });

  it('asks the browser about each optional codec', () => {
    const asked: string[] = [];
    buildPhoneProfile((m) => {
      asked.push(m);
      return false;
    });
    expect(asked).toContain('video/mp4; codecs="hvc1.1.6.L93.B0"');
    expect(asked).toContain('audio/mp4; codecs="ac-3"');
    expect(asked).toContain('audio/mp4; codecs="ec-3"');
    expect(asked).toContain('video/webm; codecs="vp9"');
  });

  it('transcodes to stereo h264/aac HLS and limits h264 to 8 bit', () => {
    const p = buildPhoneProfile(none);
    expect(p.TranscodingProfiles).toEqual([
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        Context: 'Streaming',
        MaxAudioChannels: '2',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ]);
    expect(p.CodecProfiles[0]).toMatchObject({ Codec: 'h264', Conditions: [{ Property: 'VideoBitDepth', Value: '8' }] });
    expect(p.MaxStreamingBitrate).toBe(20000000);
    expect(p.SubtitleProfiles).toEqual([]);
  });
});
