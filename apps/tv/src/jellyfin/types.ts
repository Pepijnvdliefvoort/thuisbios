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

/** Where the viewer stopped, as the server reports it for the signed-in user. */
export interface UserData {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
}

export interface ImageTags {
  Primary?: string;
  Backdrop?: string;
  Thumb?: string;
  Logo?: string;
}

/** A movie, series, season or episode. Episodes usually lack their own backdrop and logo; use `artFor`. */
export interface BaseItem {
  Id: string;
  Name: string;
  Type?: 'Movie' | 'Series' | 'Season' | 'Episode' | string;
  ProductionYear?: number;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  Overview?: string;
  Genres?: string[];
  OfficialRating?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  ChildCount?: number;
  ImageTags?: ImageTags;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  SeriesPrimaryImageTag?: string;
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  UserData?: UserData;
}

export interface ItemsResult {
  Items: BaseItem[];
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
  // Subtitle streams
  Index?: number;
  Language?: string;
  DisplayTitle?: string;
  Title?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: string;
  DeliveryUrl?: string;
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
  DefaultAudioStreamIndex?: number;
}

export interface PlaybackInfoResponse {
  MediaSources: MediaSource[];
  PlaySessionId?: string;
  ErrorCode?: string;
}

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';
