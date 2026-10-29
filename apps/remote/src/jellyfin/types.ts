/** Subset of the Jellyfin API types the remote uses. */

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

export interface AuthenticationResult {
  AccessToken: string;
  User: { Id: string; Name: string };
}

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayedPercentage?: number;
  Played?: boolean;
  LastPlayedDate?: string;
}

export interface ImageTags {
  Primary?: string;
  Backdrop?: string;
  Thumb?: string;
  Logo?: string;
}

/** A movie, series, season or episode. */
export interface BaseItem {
  Id: string;
  Name: string;
  Type?: 'Movie' | 'Series' | 'Season' | 'Episode' | string;
  ProductionYear?: number;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  SeasonName?: string;
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
  UserData?: UserData;
  /** Only present when requested with Fields=MediaSources. */
  MediaSources?: MediaSource[];
}

export interface ItemsResult {
  Items: BaseItem[];
  TotalRecordCount: number;
}

export interface PlayState {
  PositionTicks?: number;
  IsPaused?: boolean;
  CanSeek?: boolean;
  /** Jellyfin stream index of the audio the player reports using. */
  AudioStreamIndex?: number;
  /** Jellyfin stream index of the subtitles shown; -1 or missing for none. */
  SubtitleStreamIndex?: number;
  MediaSourceId?: string;
}

/** One entry of `GET /Sessions`. */
export interface RemoteSession {
  Id: string;
  DeviceId: string;
  DeviceName?: string;
  Client?: string;
  UserId?: string;
  LastActivityDate?: string;
  SupportsRemoteControl?: boolean;
  PlayableMediaTypes?: string[];
  NowPlayingItem?: BaseItem;
  PlayState?: PlayState;
}

export interface MediaStream {
  Type?: 'Video' | 'Audio' | 'Subtitle' | string;
  Codec?: string;
  Index?: number;
  DisplayTitle?: string;
  Title?: string;
  Language?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  /** Audio channel count (2 = stereo, 6 = 5.1). */
  Channels?: number;
  /** False for image subtitles (PGS, dvdsub). */
  IsTextSubtitleStream?: boolean;
}

/** One playable version of an item, from a PlaybackInfo response. */
export interface MediaSource {
  Id: string;
  Container?: string;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  DirectStreamUrl?: string;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  MediaStreams?: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
}

export interface PlaybackInfoResponse {
  MediaSources: MediaSource[];
  PlaySessionId?: string;
  ErrorCode?: string;
}

export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

/** What the phone tells Jellyfin about its own playback (start, progress, stopped). */
export interface PlaybackReport {
  itemId: string;
  mediaSourceId: string;
  playSessionId?: string;
  positionTicks: number;
  playMethod: PlayMethod;
  isPaused?: boolean;
  /** Jellyfin stream index of the audio being played. */
  audioStreamIndex?: number;
  /** Jellyfin stream index of the subtitles shown (ours or burned in); -1 for none. */
  subtitleStreamIndex?: number;
}
