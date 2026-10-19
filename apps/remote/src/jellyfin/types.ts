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
}

export interface ItemsResult {
  Items: BaseItem[];
  TotalRecordCount: number;
}

export interface PlayState {
  PositionTicks?: number;
  IsPaused?: boolean;
  CanSeek?: boolean;
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
