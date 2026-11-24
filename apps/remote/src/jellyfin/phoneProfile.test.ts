import { describe, expect, it } from 'vitest';
import { buildPhoneProfile, shouldRetrySafe } from './phoneProfile';

const none = () => false;
const all = () => true;

describe('buildPhoneProfile', () => {
  it('asks for 20 Mbit/s unless told otherwise', () => {
    expect(buildPhoneProfile(none).MaxStreamingBitrate).toBe(20000000);
    expect(buildPhoneProfile(none, 4000000).MaxStreamingBitrate).toBe(4000000);
  });

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

  it('adds a height and width cap for every video codec when a size is chosen', () => {
    const p = buildPhoneProfile(none, 4000000, { height: 720, width: 1280 });
    expect(p.MaxStreamingBitrate).toBe(4000000);
    expect(p.CodecProfiles).toContainEqual({
      Type: 'Video',
      Conditions: [
        { Condition: 'LessThanEqual', Property: 'Height', Value: '720', IsRequired: true },
        { Condition: 'LessThanEqual', Property: 'Width', Value: '1280', IsRequired: true },
      ],
    });
  });

  it('adds no size cap by default', () => {
    expect(JSON.stringify(buildPhoneProfile(none).CodecProfiles)).not.toContain('Height');
  });

  const safariLike = (m: string) => m !== 'video/webm; codecs="vp9"' && m !== 'video/x-matroska' && m !== 'video/mkv';
  const mkv = (m: string) => m === 'video/x-matroska';

  it('direct plays MKV when the browser reports it, with the mp4 codec lists', () => {
    const p = buildPhoneProfile(mkv);
    expect(p.DirectPlayProfiles).toContainEqual({ Type: 'Video', Container: 'mkv', VideoCodec: 'h264', AudioCodec: 'aac,mp3' });
    expect(buildPhoneProfile((m) => m === 'video/mkv').DirectPlayProfiles.map((d) => d.Container)).toContain('mkv');
    expect(buildPhoneProfile(none).DirectPlayProfiles.map((d) => d.Container)).not.toContain('mkv');
  });

  it('leaves MKV out on Firefox and in safe mode', () => {
    expect(buildPhoneProfile(all, 1, undefined, { firefox: true }).DirectPlayProfiles.map((d) => d.Container)).not.toContain('mkv');
    expect(buildPhoneProfile(all, 1, undefined, { safe: true }).DirectPlayProfiles.map((d) => d.Container)).not.toContain('mkv');
  });

  it('transcodes to fMP4 HLS with hevc allowed where the browser plays hevc and HLS natively', () => {
    const p = buildPhoneProfile(safariLike);
    expect(p.TranscodingProfiles).toEqual([
      {
        Type: 'Video',
        Container: 'mp4',
        Protocol: 'hls',
        VideoCodec: 'h264,hevc',
        AudioCodec: 'aac',
        Context: 'Streaming',
        MaxAudioChannels: '2',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ]);
  });

  it('keeps the ts h264 profile without native HLS or without hevc', () => {
    const noHls = (m: string) => m !== 'application/vnd.apple.mpegurl';
    expect(buildPhoneProfile(noHls).TranscodingProfiles[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264' });
    const noHevc = (m: string) => !m.includes('hvc1');
    expect(buildPhoneProfile(noHevc).TranscodingProfiles[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264' });
  });

  it('safe mode is the plain profile: no MKV, ts h264 transcode', () => {
    const p = buildPhoneProfile(all, 20000000, undefined, { safe: true });
    expect(p.DirectPlayProfiles.map((d) => d.Container)).toEqual(['mp4,m4v,mov', 'webm']);
    expect(p.TranscodingProfiles[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264' });
  });
});

describe('shouldRetrySafe', () => {
  it('retries once, before playback started, on a remote stream', () => {
    expect(shouldRetrySafe({ safe: false, started: false })).toBe(true);
    expect(shouldRetrySafe({ safe: true, started: false })).toBe(false);
    expect(shouldRetrySafe({ safe: false, started: true })).toBe(false);
    expect(shouldRetrySafe({ safe: false, started: false, isLocal: true })).toBe(false);
  });
});
