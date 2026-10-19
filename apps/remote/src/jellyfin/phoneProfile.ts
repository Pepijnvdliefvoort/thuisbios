/** Jellyfin DeviceProfile for the phone's own browser (iOS Safari 15+, Android Chrome). */

interface Condition {
  Condition: 'Equals' | 'NotEquals' | 'LessThanEqual' | 'GreaterThanEqual' | 'EqualsAny';
  Property: string;
  Value: string;
  IsRequired: boolean;
}

export interface DeviceProfile {
  Name: string;
  MaxStreamingBitrate: number;
  MaxStaticBitrate: number;
  MusicStreamingTranscodingBitrate: number;
  DirectPlayProfiles: Array<{
    Type: 'Video' | 'Audio';
    Container: string;
    VideoCodec?: string;
    AudioCodec?: string;
  }>;
  TranscodingProfiles: Array<{
    Type: 'Video' | 'Audio';
    Container: string;
    Protocol: string;
    VideoCodec?: string;
    AudioCodec: string;
    Context: 'Streaming' | 'Static';
    MaxAudioChannels?: string;
    MinSegments?: number;
    BreakOnNonKeyFrames?: boolean;
  }>;
  ContainerProfiles: never[];
  CodecProfiles: Array<{
    Type: 'Video' | 'VideoAudio';
    Codec?: string;
    Conditions: Condition[];
  }>;
  SubtitleProfiles: Array<{ Format: string; Method: 'External' | 'Embed' | 'Hls' | 'Encode' }>;
}

/**
 * Builds the profile from what the browser says it can decode. `canPlay` gets a MIME type with codecs
 * (for example `video/mp4; codecs="hvc1.1.6.L93.B0"`) and answers whether the browser supports it.
 */
export function buildPhoneProfile(canPlay: (mime: string) => boolean): DeviceProfile {
  const mp4Video = ['h264'];
  if (canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"')) mp4Video.push('hevc');

  const mp4Audio = ['aac', 'mp3'];
  if (canPlay('audio/mp4; codecs="ac-3"')) mp4Audio.push('ac3');
  if (canPlay('audio/mp4; codecs="ec-3"')) mp4Audio.push('eac3');
  if (canPlay('audio/mp4; codecs="flac"')) mp4Audio.push('flac');
  if (canPlay('audio/mp4; codecs="opus"')) mp4Audio.push('opus');

  const directPlay: DeviceProfile['DirectPlayProfiles'] = [
    { Type: 'Video', Container: 'mp4,m4v,mov', VideoCodec: mp4Video.join(','), AudioCodec: mp4Audio.join(',') },
  ];
  if (canPlay('video/webm; codecs="vp9"')) {
    directPlay.push({ Type: 'Video', Container: 'webm', VideoCodec: 'vp8,vp9', AudioCodec: 'opus,vorbis' });
  }

  return {
    Name: 'Thuisbios Remote (phone browser)',
    MaxStreamingBitrate: 20000000,
    MaxStaticBitrate: 100000000,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: directPlay,
    TranscodingProfiles: [
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
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: 'Video',
        Codec: 'h264',
        Conditions: [{ Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: false }],
      },
    ],
    SubtitleProfiles: [],
  };
}
