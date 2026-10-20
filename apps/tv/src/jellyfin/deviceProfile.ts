/** Jellyfin DeviceProfile describing the 2018 Samsung UE49NU7100 (Tizen 4.0, Chromium 56). */

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

export const VIDEO_CODECS = ['h264', 'hevc', 'vp9'];
export const AUDIO_CODECS = ['aac', 'mp3', 'ac3', 'eac3'];

const cond = (
  Property: string,
  Condition: Condition['Condition'],
  Value: string,
  IsRequired = false,
): Condition => ({ Condition, Property, Value, IsRequired });

export interface ProfileOptions {
  /** Bits per second the TV network link should carry (LAN port is 100 Mbit/s). */
  maxStreamingBitrate?: number;
}

export function buildDeviceProfile(options: ProfileOptions = {}): DeviceProfile {
  const video = VIDEO_CODECS.join(',');
  const audio = AUDIO_CODECS.join(',');
  return {
    Name: 'Thuisbios TV (Tizen 4.0)',
    MaxStreamingBitrate: options.maxStreamingBitrate ?? 40000000,
    MaxStaticBitrate: 100000000,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: [
      { Type: 'Video', Container: 'mp4,m4v', VideoCodec: video, AudioCodec: audio },
      { Type: 'Video', Container: 'mkv', VideoCodec: video, AudioCodec: audio },
      { Type: 'Video', Container: 'ts,mpegts', VideoCodec: video, AudioCodec: audio },
      { Type: 'Audio', Container: 'mp3', AudioCodec: 'mp3' },
      { Type: 'Audio', Container: 'aac,m4a', AudioCodec: 'aac' },
    ],
    TranscodingProfiles: [
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        VideoCodec: 'h264,hevc',
        AudioCodec: 'aac,ac3',
        Context: 'Streaming',
        MaxAudioChannels: '6',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: 'Video',
        Codec: 'h264',
        // The TV hardware decodes 8-bit H.264 only, up to level 5.1.
        Conditions: [
          cond('VideoBitDepth', 'LessThanEqual', '8'),
          cond('VideoLevel', 'LessThanEqual', '51'),
          cond('IsAnamorphic', 'NotEquals', 'true'),
        ],
      },
      {
        Type: 'Video',
        Codec: 'hevc',
        // 10-bit (HDR10) is fine, up to 4K.
        Conditions: [
          cond('VideoBitDepth', 'LessThanEqual', '10'),
          cond('Width', 'LessThanEqual', '3840'),
          cond('Height', 'LessThanEqual', '2160'),
        ],
      },
      {
        Type: 'VideoAudio',
        Conditions: [cond('AudioChannels', 'LessThanEqual', '6')],
      },
    ],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
    ],
  };
}
