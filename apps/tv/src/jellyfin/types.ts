/** Small subset of the Jellyfin API types used by the spike. */

export interface ClientInfo {
  client: string;
  device: string;
  deviceId: string;
  version: string;
}

export interface Session {
  serverUrl: string;
  token: string;
  userId: string;
  userName: string;
}

export interface QuickConnectState {
  Secret: string;
  Code: string;
  Authenticated?: boolean;
}

export interface AuthenticationResult {
  AccessToken: string;
  User: { Id: string; Name: string };
}

export interface MovieItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  ImageTags?: { Primary?: string };
}

export interface ItemsResult {
  Items: MovieItem[];
  TotalRecordCount: number;
}

export interface MediaStream {
  Type: 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | string;
  Codec?: string;
  Width?: number;
  Height?: number;
  Profile?: string;
  BitDepth?: number;
  VideoRangeType?: string;
  Channels?: number;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  Bitrate?: number;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  DirectStreamUrl?: string;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  TranscodingContainer?: string;
  MediaStreams?: MediaStream[];
}

export interface PlaybackInfoResponse {
  MediaSources: MediaSource[];
  PlaySessionId?: string;
  ErrorCode?: string;
}

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';
