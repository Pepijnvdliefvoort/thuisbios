import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { TogetherSheet } from '../components/TogetherSheet';
import { usePlayerSync } from '../syncplay/usePlayerSync';
import { PlayerControls } from '../components/PlayerControls';
import { useScrubInfo } from '../components/ScrubPreview';
import { NextEpisodeCard } from '../components/NextEpisodeCard';
import { useApp } from '../context';
import { exitLandscapeFullscreen, supportsElementFullscreen } from '../fullscreen';
import { artUrl } from '../jellyfin/art';
import { defaultAudioIndex, listAudio, pickInitialAudio } from '../jellyfin/audio';
import { useMediaSession } from '../mediaSession';
import { getPlayerVideo, releasePlayerVideo } from '../playerVideo';
import { playerKeyAction, stepVolume } from '../playerKeys';
import { tapSide, type TapSide } from '../tapSide';
import { getDeviceId, loadAudioLang, saveLocalProgress, loadPlayerVolume, loadSubtitleLang, loadSubtitleOffset, saveAudioLang, savePlayerVolume, saveSubtitleLang } from '../storage';
import { episodeLabel, secondsToTicks, ticksToSeconds } from '../jellyfin/format';
import { maxBitrateFor, measureBitrate } from '../jellyfin/bitrate';
import { buildPhoneProfile, shouldRetrySafe } from '../jellyfin/phoneProfile';
import { AUTO_REENCODE_MAX_HEIGHT, autoCapFor, playingResolution, qualityOptions, requestFor, sourceLevel, type QualityId } from '../jellyfin/quality';
import { nextArmedAt, nextEpisodeCard, planNextEpisode, shouldMarkPlayedOnSkip, type NextEpisodePlan } from '../jellyfin/nextEpisode';
import { mpegTsShift } from '../jellyfin/hlsTimeline';
import { activeIntro, type MediaSegment } from '../jellyfin/segments';
import { createThrottle, resolveStreamUrl, selectPlayMethod, videoCopyAllowed, type PlaySelection } from '../jellyfin/playback';
import { activeCueText, listSubtitles, parseVtt, pickInitialSubtitle, subtitleVttUrl, type Cue } from '../jellyfin/subtitles';
import type { BaseItem, MediaSource, PlaybackReport } from '../jellyfin/types';
import { pickAutoVersion, pickVersionForLevel, versionLevels } from '../jellyfin/versions';
import { COARSE_QUERY, isDesktop, useFinePointer } from '../useDesktop';
import { useMediaQuery } from '../useMediaQuery';
import { useAdjacentEpisodes } from '../useNextEpisode';
import { createCacheLoader } from '../offline/cacheLoader';
import { DOWNLOADS_CACHE, playlistKey } from '../offline/downloadKeys';
import { resolveUri } from '../offline/hlsPlaylist';
import { isFinished, removedToast, shouldAutoDelete } from '../offline/localPlayback';
import { startGapTarget } from '../offline/startGap';
import { useDownloadedAdjacent } from '../offline/useDownloadedAdjacent';
import { useLocalAssets } from '../offline/useLocalAssets';
import { useOnline } from '../offline/useOnline';
import { usePosters } from '../offline/usePosters';
import { createCacheStore } from '../offline/downloadStore';
import { useViewportPortrait } from '../useViewportPortrait';

/** The picture quality picked in the player. Lives for the app session only: the next episode keeps it, a fresh start is Auto. */
let sessionQuality: QualityId = 'auto';
/** What Auto asks for once it has to cap a big picture: the 1080p level. */
const AUTO_CAP = requestFor(AUTO_REENCODE_MAX_HEIGHT, null);

const PROGRESS_MS = 10000;
/** Pause, play and seek reports go out at once, but never more often than this. */
const EVENT_REPORT_MS = 1000;
const HLS_MIME = 'application/vnd.apple.mpegurl';

let nativeHlsCache: boolean | undefined;
/** True where the browser plays HLS itself (iPhone / Safari); false where hls.js has to. Computed once. */
function browserPlaysHlsNatively(): boolean {
  if (nativeHlsCache === undefined) nativeHlsCache = document.createElement('video').canPlayType(HLS_MIME) !== '';
  return nativeHlsCache;
}
/** Controls fade out this long after the last touch while playing. */
const HIDE_MS = 3000;
/** Mouse: a second click within this time is a double click (fullscreen) and not a play / pause. */
const DOUBLE_CLICK_MS = 220;
/** Phone: a second tap within this time on the same side skips instead of toggling the controls. */
const DOUBLE_TAP_MS = 250;
/** Phone: after a double tap skipped, each further tap on that side skips again until this long after the last one. */
const SEEK_STREAK_MS = 700;
/** The skip indicator fades out this long after the last skip. */
const SEEK_HINT_MS = 600;
/** Seconds skipped by a double tap. */
const TAP_SKIP_S = 10;
/** Mouse moves restart the hide timer at most this often. */
const MOVE_MS = 250;
/** Esc right after leaving fullscreen is the browser's own exit, not a request to leave the player. */
const FS_ESC_GRACE_MS = 400;
/** Stands in for the client while a trailer plays: nothing is reported, so the trailer leaves no watch state anywhere. */
const silentReports = {
  reportStart: () => Promise.resolve(),
  reportProgress: () => Promise.resolve(),
  reportStopped: () => Promise.resolve(),
};

interface Loaded {
  selection: PlaySelection;
  url: string;
  mediaSourceId: string;
  playSessionId?: string;
  /** Kept to list the audio and subtitle tracks. */
  source: MediaSource;
  /** Jellyfin stream index of the audio this stream plays; null when the source lists no audio. */
  audioIndex: number | null;
  /** Where the stream was asked to start (ticks): the resume point, or the spot an audio switch left. */
  startTicks: number;
  /** The stream was asked with video copy allowed: a text subtitle needs a re-encoded stream instead. */
  copyAllowed: boolean;
}

/**
 * Plays an item on the phone itself and reports progress to Jellyfin, so it counts toward Resume watching.
 *
 * Start position: a transcode is requested with StartTimeTicks, so the server begins encoding there. Jellyfin's
 * HLS playlist is still full length (segments before the start are simply not made), so the video's
 * currentTime is the position in the whole item. Every method therefore seeks to the start position itself
 * once the metadata is known (hls.js through `startPosition`).
 *
 * Position everywhere in this component is time in the original file. With hls.js the video's timeline can be
 * a few seconds off from it (a remux starts at the keyframe before the requested point, see hlsTimeline.ts), so
 * `toMedia` / `toVideo` convert with `shift`. It is 0 for native playback.
 *
 * Audio: a browser cannot pick another audio stream out of a file, so a switch asks for PlaybackInfo again with
 * AudioStreamIndex (and direct play off, so the server remuxes or transcodes) and restarts the stream at the
 * current position. The old play session reports Stopped and the new one Started, as for any new stream.
 *
 * Subtitles: text tracks are drawn by us (WebVTT) and never need a new stream. PlaybackInfo always asks for
 * SubtitleStreamIndex=-1, or else Jellyfin burns in the item's default track (it only honours the audio and
 * subtitle index together with MediaSourceId, which the client always sends). An image track (PGS, dvdsub) can only be
 * burned in: choosing one restarts the stream like an audio switch, and so does leaving it for a text track or Off.
 * PlaybackInfo sends AllowVideoStreamCopy=true only while no text subtitle of ours is shown (`copyOk`) and never
 * where the browser plays HLS itself (iPhone / Safari: its player stutters at every segment boundary of a remuxed
 * stream, while hls.js copes): then
 * Jellyfin may remux the video into HLS instead of re-encoding it, which starts much faster. Remuxed segments are cut
 * at keyframes and do not line up with the playlist times, so our overlay would drift by seconds; with a text
 * subtitle on the video is re-encoded, which lines them up exactly (the hls.js shift is then 0). The first guess
 * is "off" only when the user turned subtitles off last time; the first answer corrects it (one extra request,
 * shared with the other re-asks). Turning a text subtitle on during a remuxed stream restarts it re-encoded.
 * Direct play is unaffected.
 *
 * Playing a download (`local`): nothing is asked of the server. hls.js plays the saved playlist straight from the
 * Cache API (always hls.js, even where the browser has native HLS), the text subtitles and intro / credits markers come
 * from the files saved with the download, and there is no audio or quality menu (they need the server). The position is
 * saved on this device and queued for Jellyfin (see offline/progressSync.ts); online it is also reported as usual.
 * An episode watched to the end is removed from the downloads when the player closes.
 *
 * The video is always inline with our own controls and subtitles (see PlayerControls). iPhone cannot go
 * fullscreen or lock the orientation, so when the viewport is portrait the whole stage is turned 90° with CSS
 * (only on a touch device: a narrow desktop window never rotates).
 *
 * With a mouse (`mouse`): moving the pointer shows the controls (they hide 3 s later, or at once when the pointer
 * leaves the window), a click plays / pauses, a double click toggles fullscreen, the bottom bar
 * gets volume and fullscreen buttons, and the keys in playerKeys.ts work.
 */
export function Player({
  item,
  startTicks,
  local = false,
  onBack,
  onPlayEpisode,
}: {
  item: BaseItem;
  startTicks: number;
  /** Play the finished download of this item from the device instead of asking Jellyfin. */
  local?: boolean;
  onBack: () => void;
  /** Plays another episode (autoplay, or the previous/next buttons) in place of this one, from its start. */
  onPlayEpisode: (episode: BaseItem) => void;
}) {
  const { client, session, downloads, toast, progress } = useApp();
  const isLocal = local;
  // A trailer is its own item: it is never resumed, reports nothing to Jellyfin (the movie keeps its state) and has no intro markers.
  const isTrailer = item.Type === 'Trailer';
  const assets = useLocalAssets(isLocal ? item.Id : null);
  const online = useOnline();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  // The app's one shared <video> (see playerVideo.ts), put into the stage by `attachVideo`.
  const video = useRef<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((host: HTMLDivElement | null) => {
    if (!host) {
      video.current = null;
      return;
    }
    const el = getPlayerVideo();
    if (el.parentNode !== host) host.appendChild(el);
    video.current = el;
  }, []);
  const [segments, setSegments] = useState<MediaSegment[]>([]);
  const [now, setNow] = useState(0);
  const portrait = useViewportPortrait();
  const coarse = useMediaQuery(COARSE_QUERY);
  const rotated = portrait && coarse;
  const mouse = useFinePointer();
  // Preview frames while scrubbing; they come from the server, so a download played offline has none.
  const { source: scrubSource, chapters } = useScrubInfo(
    client,
    session.userId,
    session.token,
    item.Id,
    loaded ? loaded.mediaSourceId : null,
    mouse ? 220 : 160,
    online,
    ticksToSeconds(item.RunTimeTicks || 0),
  );
  // Our own controls.
  const [paused, setPaused] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(0);
  // Mouse only: the video's volume and whether the page is fullscreen.
  const [vol, setVol] = useState({ volume: 1, muted: false });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastSub = useRef(-1);
  const lastMove = useRef(0);
  const clickTimer = useRef<number | undefined>(undefined);
  // Phone taps: the first tap waiting for a second one, and the double-tap skip streak.
  const tapTimer = useRef<number | undefined>(undefined);
  const tapAt = useRef<TapSide>('middle');
  const streakTimer = useRef<number | undefined>(undefined);
  const streakSide = useRef<TapSide>('middle');
  const streakTotal = useRef(0);
  const hintTimer = useRef<number | undefined>(undefined);
  const [hint, setHint] = useState<{ side: TapSide; total: number; on: boolean }>({ side: 'right', total: 0, on: false });
  const fsChangedAt = useRef(0);
  // Our own subtitles: the chosen track (-1 = off) and its parsed cues.
  const [subSel, setSubSel] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);
  // Audio: the stream asked for (null = the server's default), and where a restart should resume.
  const [audioSel, setAudioSel] = useState<number | null>(null);
  // The image subtitle asked to be burned in (Jellyfin stream index; null = none).
  const [burnSel, setBurnSel] = useState<number | null>(null);
  // Never chose a subtitle language: the first request omits SubtitleStreamIndex, so the server reports its own default.
  const [probe, setProbe] = useState(() => loadSubtitleLang() === null);
  // Video copy (remux) allowed: no text subtitle is shown. Guess from the last choice; the first answer settles it.
  const [copyOk, setCopyOk] = useState(() => videoCopyAllowed({ nativeHls: browserPlaysHlsNatively(), textSubtitleOn: loadSubtitleLang() !== '' }));
  const restartTicks = useRef(startTicks);
  const picked = useRef(false);
  const [qualitySel, setQualitySel] = useState<QualityId>(sessionQuality);
  /** The source's own level, known after the first answer; a chosen level at or above it means the original. */
  const srcLevel = useRef<number | null>(null);
  // The versions of this film (4K, 1080p, ...), fetched once per item. Tagged with the item so a stale list is never used.
  const [versionList, setVersionList] = useState<{ id: string; list: MediaSource[] } | null>(null);
  const versions = versionList && versionList.id === item.Id ? versionList.list : null;
  useEffect(() => {
    if (isLocal) return;
    let alive = true;
    client
      .mediaSources(session.userId, item.Id)
      .catch(() => [] as MediaSource[])
      .then((list) => alive && setVersionList({ id: item.Id, list }));
    return () => {
      alive = false;
    };
  }, [client, session.userId, item.Id, isLocal]);
  // Auto found that the server would re-encode a picture above 1080p: ask for 1080p instead.
  const [autoCapped, setAutoCapped] = useState(false);
  /** Bumped to ask again once the source is known and the first request was capped for nothing. */
  const [requery, setRequery] = useState(0);
  /** Set once a stream failed before playing: PlaybackInfo is asked again with the safe profile (no MKV direct play, no fMP4 HLS). */
  const [safe, setSafe] = useState(false);
  // Last playing position, for reports after the video has been reset.
  const lastTime = useRef(ticksToSeconds(startTicks));
  // Seconds from the video's currentTime to the original file time (hls.js only, see hlsTimeline.ts).
  const shift = useRef(0);
  const toMedia = (t: number) => t + shift.current;
  const toVideo = (position: number) => position - shift.current;
  // Next episode autoplay: the card, and the hooks into the reporting effect below.
  // Offline there is no server to ask, so the neighbours are the episodes that are downloaded too.
  const offlineLocal = isLocal && !online;
  const fromServer = useAdjacentEpisodes(client, session.userId, offlineLocal ? null : item);
  const fromDownloads = useDownloadedAdjacent(downloads.entries, item, offlineLocal);
  const { previous, next } = offlineLocal ? fromDownloads : fromServer;
  const [cancelled, setCancelled] = useState(false);
  // The next episode's picture comes from its download when it has one (offline there is no server to ask).
  const posterStore = useMemo(() => (isLocal ? createCacheStore() : null), [isLocal]);
  const nextPosters = usePosters(posterStore, next ? [next.Id] : []);
  // Jellyfin index of the subtitle track chosen (-1 = off), for progress reports.
  const subIndex = useRef(-1);
  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const advancing = useRef(false);
  // The shared element still holds the previous episode until this player attaches its own stream: ignore its events.
  const ownStream = useRef(false);
  // Playing a download: how the playback ended, for the watched mark and removing a watched episode.
  const endedRef = useRef(false);
  const markedRef = useRef(false);
  const autoDelete = useRef(false);
  const planRef = useRef<NextEpisodePlan | null>(null);
  // Watch together: inside a group the controls ask the group and the group drives the video (see syncplay/usePlayerSync.ts).
  const [togetherOpen, setTogetherOpen] = useState(false);
  const sync = usePlayerSync({
    video,
    item,
    enabled: !isLocal && !isTrailer,
    ownStream,
    advancing,
    toMedia,
    toVideo,
    switchTo: (episode, markPlayed) => switchTo(episode, markPlayed),
    stream: loaded,
  });

  // Intro markers (empty without the Intro Skipper plugin).
  useEffect(() => {
    let alive = true;
    setSegments([]);
    if (isTrailer) return;
    if (isLocal) {
      setSegments(assets.segments);
      return;
    }
    client
      .mediaSegments(item.Id)
      .then((list) => alive && setSegments(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, item.Id, isLocal, isTrailer, assets]);

  // Leaving the player (Back, Android back, end of video) also leaves fullscreen and frees the rotation.
  // Not when the next episode takes over: it stays fullscreen (autoplay has no tap to enter it again).
  useEffect(
    () => () => {
      if (!advancing.current) exitLandscapeFullscreen();
    },
    [],
  );

  // Media events and the poster go on the shared element by hand (it is not part of our JSX). The handlers are
  // re-read from `media` on every event so they see the current state.
  const posterUrl = isLocal ? '' : (mouse ? artUrl(client.serverUrl, item, 'backdrop', 1920, 1080) : artUrl(client.serverUrl, item, 'backdrop', 780, 440)) || '';
  const media = useRef({
    timeUpdate: (_el: HTMLVideoElement) => {},
    volume: (_el: HTMLVideoElement) => {},
    progress: (_el: HTMLVideoElement) => {},
    duration: (_el: HTMLVideoElement) => {},
  });
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // The element outlives the player: start from what it really is doing.
    setPaused(el.paused);
    const on = (type: string, fn: () => void) => {
      el.addEventListener(type, fn);
      return () => el.removeEventListener(type, fn);
    };
    const offs = [
      on('timeupdate', () => media.current.timeUpdate(el)),
      on('play', () => setPaused(false)),
      on('pause', () => setPaused(true)),
      on('waiting', () => setBuffering(true)),
      on('seeking', () => setBuffering(true)),
      on('playing', () => setBuffering(false)),
      on('canplay', () => setBuffering(false)),
      on('seeked', () => setBuffering(false)),
      on('progress', () => media.current.progress(el)),
      on('loadedmetadata', () => media.current.duration(el)),
      on('durationchange', () => media.current.duration(el)),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => {
    const el = video.current;
    if (!el || !mouse) return;
    const onVolume = () => media.current.volume(el);
    el.addEventListener('volumechange', onVolume);
    return () => el.removeEventListener('volumechange', onVolume);
  }, [mouse]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (posterUrl) el.setAttribute('poster', posterUrl);
    else el.removeAttribute('poster');
  }, [posterUrl]);

  // We draw the subtitles ourselves: keep the browser's own text tracks off (iOS would draw embedded ones).
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const disable = () => {
      for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = 'disabled';
    };
    el.addEventListener('loadedmetadata', disable);
    el.textTracks.addEventListener('addtrack', disable);
    disable();
    return () => {
      el.removeEventListener('loadedmetadata', disable);
      el.textTracks.removeEventListener('addtrack', disable);
    };
  }, []);

  const tracks = useMemo(() => (isLocal ? assets.tracks : loaded ? listSubtitles(loaded.source) : []), [loaded, isLocal, assets]);
  subIndex.current = tracks[subSel] ? tracks[subSel].index : -1;
  const subOffset = useMemo(() => loadSubtitleOffset(item.Id), [item.Id]);
  // Fetch the WebVTT of the chosen track once; a failure just shows no subtitles.
  useEffect(() => {
    setCues([]);
    const track = tracks[subSel];
    if (!loaded || !track || track.burnIn) return;
    if (isLocal) {
      const text = assets.vtt[track.index];
      if (text) setCues(parseVtt(text));
      return;
    }
    let alive = true;
    fetch(subtitleVttUrl(client.serverUrl, item.Id, loaded.mediaSourceId, track.index, session.token))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => alive && setCues(parseVtt(text)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [loaded, tracks, subSel]);
  const audioTracks = useMemo(() => (loaded && !isLocal ? listAudio(loaded.source) : []), [loaded, isLocal]);
  // Auto shows what it ended up playing ("Auto (720p)"); a fixed level is already named by its own entry.
  const qualityChoices = useMemo(
    () => (loaded && !isLocal ? qualityOptions(loaded.source, qualitySel === 'auto' ? playingResolution(loaded.source, loaded.selection.method, loaded.selection.url) : null, versions ? versionLevels(versions) : []) : []),
    [loaded, qualitySel, isLocal, versions],
  );
  /** Notes the current position so the new stream starts there, and shows the loading state. */
  const prepareRestart = () => {
    const el = video.current;
    if (el && el.currentTime > 0) restartTicks.current = secondsToTicks(toMedia(el.currentTime));
    else restartTicks.current = secondsToTicks(lastTime.current);
    setBuffering(true);
    sync.noteRestart();
  };
  const chooseAudio = (index: number) => {
    prepareRestart();
    setAudioSel(index);
    const track = audioTracks.filter((t) => t.index === index)[0];
    if (track && track.lang) saveAudioLang(track.lang);
  };
  const chooseQuality = (id: QualityId) => {
    if (id === qualitySel) return;
    prepareRestart();
    sessionQuality = id;
    setAutoCapped(false);
    setQualitySel(id);
  };
  const chooseSubtitle = (index: number) => {
    setSubSel(index);
    // Only a change of the burned-in track needs a new stream: text tracks and Off are drawn by us.
    const burn = tracks[index] && tracks[index].burnIn ? tracks[index].index : null;
    const textOn = index >= 0 && !!tracks[index] && !tracks[index].burnIn;
    // A remuxed stream has keyframe-cut segments that would make our overlay drift: restart it re-encoded.
    const reencode = textOn && !!loaded && loaded.copyAllowed && loaded.selection.method === 'Transcode';
    if (burn !== burnSel || reencode) {
      prepareRestart();
      setBurnSel(burn);
    }
    if (textOn && copyOk) setCopyOk(false);
    // '' remembers "off". A track without a language cannot be matched later, so it is not remembered.
    if (index < 0) saveSubtitleLang('');
    else if (tracks[index] && tracks[index].lang) saveSubtitleLang(tracks[index].lang);
  };

  // Controls: shown by a tap, hidden again 3 s after the last touch while playing.
  const keepUp = paused || busy || !loaded;
  useEffect(() => {
    if (!shown || keepUp) return;
    const timer = window.setTimeout(() => setShown(false), HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [shown, keepUp, touched]);
  const interact = () => {
    setShown(true);
    setTouched((n) => n + 1);
  };
  const controlsUp = shown || keepUp;
  const togglePlay = () => {
    const el = video.current;
    if (!el || sync.toggle()) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };
  const seekTo = (seconds: number) => {
    const el = video.current;
    if (!el) return;
    const max = duration > 0 ? duration : seconds;
    const to = Math.max(0, Math.min(max, seconds));
    if (sync.active) {
      setNow(to);
      sync.seek(to);
      return;
    }
    el.currentTime = toVideo(to);
    setNow(to);
  };
  const skipBy = (delta: number) => {
    const el = video.current;
    if (el) seekTo(toMedia(el.currentTime) + delta);
  };
  const syncBuffered = (el: HTMLVideoElement) => {
    const r = el.buffered;
    let end = 0;
    for (let i = 0; i < r.length; i++) if (r.start(i) <= el.currentTime + 0.5 && r.end(i) > end) end = r.end(i);
    setBuffered(toMedia(end));
  };
  const syncDuration = (el: HTMLVideoElement) => {
    setDuration(isFinite(el.duration) && el.duration > 0 ? el.duration : ticksToSeconds(item.RunTimeTicks || 0));
  };

  // Mouse only: volume (restored from the last session), fullscreen and the keyboard.
  const syncVolume = (el: HTMLVideoElement) => setVol({ volume: el.volume, muted: el.muted });
  media.current = {
    timeUpdate: (el) => {
      if (!ownStream.current) return;
      const v = el.currentTime;
      const t = Math.max(0, duration > 0 ? Math.min(duration, toMedia(v)) : toMedia(v));
      if (v > 0) lastTime.current = t;
      setNow(t);
    },
    volume: syncVolume,
    progress: (el) => {
      if (ownStream.current) syncBuffered(el);
    },
    duration: (el) => {
      if (ownStream.current) syncDuration(el);
    },
  };
  const setVolume = (value: number) => {
    const el = video.current;
    if (!el) return;
    const next = Math.max(0, Math.min(1, value));
    el.volume = next;
    if (next > 0) el.muted = false;
    savePlayerVolume(next);
  };
  const toggleMute = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.volume === 0) setVolume(0.5);
  };
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else if (supportsElementFullscreen()) void document.documentElement.requestFullscreen().catch(() => undefined);
    } catch (e) {
      // Fullscreen refused: the player keeps filling the window.
    }
  };
  /** Subtitles on or off: back to the track used last (the first one if none yet). */
  const toggleSubtitles = () => {
    if (tracks.length === 0) return;
    if (subSel >= 0) {
      lastSub.current = subSel;
      chooseSubtitle(-1);
    } else {
      // Never used yet: the first text track, so a key press does not start a burn-in.
      const first = lastSub.current >= 0 ? lastSub.current : Math.max(0, tracks.findIndex((t) => !t.burnIn));
      chooseSubtitle(Math.min(first, tracks.length - 1));
    }
  };
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (togetherOpen) return; // the group sheet has the keyboard (Esc closes it)
    const action = playerKeyAction(e);
    if (!action) return;
    if (action.type === 'exit') {
      // In fullscreen the browser handles Esc itself (and the keydown can land just after it left).
      if (document.fullscreenElement || Date.now() - fsChangedAt.current < FS_ESC_GRACE_MS) return;
      e.preventDefault();
      onBack();
      return;
    }
    // Also stops Space from pressing a focused button.
    e.preventDefault();
    interact();
    if (e.repeat && action.type !== 'skip' && action.type !== 'volume') return;
    switch (action.type) {
      case 'togglePlay':
        return togglePlay();
      case 'skip':
        return skipBy(action.seconds);
      case 'volume':
        return setVolume(stepVolume(vol.volume, action.delta));
      case 'mute':
        return toggleMute();
      case 'fullscreen':
        return toggleFullscreen();
      case 'subtitles':
        return toggleSubtitles();
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    if (!mouse) return;
    const down = (e: KeyboardEvent) => onKeyRef.current(e);
    // Firefox presses a focused button on the key release; keydown's preventDefault does not stop that.
    const up = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [mouse]);
  useEffect(() => {
    const el = video.current;
    if (!mouse || !el) return;
    const saved = loadPlayerVolume();
    if (saved !== null) el.volume = saved;
    syncVolume(el);
  }, [mouse]);
  useEffect(() => {
    if (!mouse) return;
    const onChange = () => {
      fsChangedAt.current = Date.now();
      setIsFullscreen(!!document.fullscreenElement);
    };
    setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [mouse]);
  useEffect(
    () => () => {
      window.clearTimeout(clickTimer.current);
      window.clearTimeout(tapTimer.current);
      window.clearTimeout(streakTimer.current);
      window.clearTimeout(hintTimer.current);
    },
    [],
  );

  // Ask the server how to play this item on this phone.
  useEffect(() => {
    // Wait for the version list, so the first request already goes to the right version.
    if (isLocal || versions === null) return;
    let cancelled = false;
    const canPlay = document.createElement('video');
    // With several versions, pick the one to play: Auto by device, a fixed level by its own or the next one up.
    const wanted = versions.length > 1 ? (qualitySel === 'auto' ? pickAutoVersion(versions, { desktop: isDesktop() }) : pickVersionForLevel(versions, qualitySel)) : null;
    const wantedSource = wanted ? versions.filter((v) => v.Id === wanted)[0] : undefined;
    const wantedLevel = wantedSource ? sourceLevel(wantedSource) : null;
    // That version's own level is the one a fixed choice is compared with: equal means the original (direct play).
    const known = wantedLevel ? wantedLevel.height : srcLevel.current;
    // A fixed choice is asked for as it is. Auto only gets a cap once it found the server would re-encode a big picture.
    const fixed = qualitySel === 'auto' ? (autoCapped ? AUTO_CAP : null) : requestFor(qualitySel, known);
    // A level below the source's own size forces a transcode (the profile's size cap would anyway; this is explicit).
    const lowered = !!fixed && !fixed.original && known !== null;
    // Measure the connection first: a mobile link that cannot carry the full bitrate never starts playing.
    measureBitrate(client)
      .then((bps) => {
        if (cancelled) return undefined;
        // A fixed quality replaces the measured bitrate with its own cap and scales the picture down to its height.
        // Once the source's size is known, a level at or above it is the original: direct play stays possible.
        const profile = buildPhoneProfile(
          (mime) => canPlay.canPlayType(mime) !== '',
          fixed ? (qualitySel === 'auto' ? Math.min(maxBitrateFor(bps), fixed.bitrate) : fixed.bitrate) : maxBitrateFor(bps),
          fixed && fixed.maxHeight && fixed.maxWidth ? { height: fixed.maxHeight, width: fixed.maxWidth } : undefined,
          { safe, firefox: /firefox/i.test(navigator.userAgent) },
        );
        return client.playbackInfo(session.userId, item.Id, profile, {
          mediaSourceId: wanted || undefined,
          startTicks: restartTicks.current,
          audioStreamIndex: audioSel === null ? undefined : audioSel,
          subtitleStreamIndex: probe ? null : burnSel === null ? undefined : burnSel,
          directPlay: audioSel === null && burnSel === null && !lowered ? undefined : false,
          allowVideoStreamCopy: copyOk,
        });
      })
      .then((info) => {
        if (cancelled || !info) return;
        const source = (wanted && info.MediaSources.filter((m) => m.Id === wanted)[0]) || info.MediaSources[0];
        const level = source ? sourceLevel(source) : null;
        srcLevel.current = level ? level.height : null;
        // The first request knew nothing of the source and capped the chosen level; ask again for the original.
        if (source && qualitySel !== 'auto' && level && known === null && qualitySel >= level.height) {
          setRequery((n) => n + 1);
          return;
        }
        const audio = source ? listAudio(source) : [];
        const defaultAudio = defaultAudioIndex(audio);
        // First answer: if the remembered audio language is not the default one, or the first subtitle track is an
        // image one, ask again for that track (both at once when both apply). A probe always asks again, as its
        // stream URL may burn in the server's default subtitle track.
        if (source && !picked.current) {
          picked.current = true;
          const want = audioSel === null ? pickInitialAudio(audio, loadAudioLang()) : null;
          const subs = listSubtitles(source);
          const sel = pickInitialSubtitle(subs, loadSubtitleLang(), source.DefaultSubtitleStreamIndex);
          setSubSel(sel);
          const burn = sel >= 0 && subs[sel].burnIn ? subs[sel].index : null;
          const copyNow = videoCopyAllowed({ nativeHls: browserPlaysHlsNatively(), textSubtitleOn: sel >= 0 && !subs[sel].burnIn });
          // A wrong copy guess only matters when the file cannot direct play (then the server remuxes or transcodes).
          const copyMatters = copyNow !== copyOk && !source.SupportsDirectPlay;
          if (want !== null || burn !== null || probe || copyMatters) {
            if (want !== null) setAudioSel(want);
            if (burn !== null) setBurnSel(burn);
            setCopyOk(copyNow);
            setProbe(false);
            return;
          }
        }
        // Auto: a picture above 1080p that the server has to re-encode is too much for it in real time. Checked
        // after the re-asks above, as those can change whether the video is copied.
        if (source && qualitySel === 'auto' && !autoCapped && autoCapFor(source, { videoCopy: copyOk })) {
          setAutoCapped(true);
          return;
        }
        const chosen = audioSel !== null ? audioSel : defaultAudio;
        const selection =
          source &&
          selectPlayMethod(source, {
            itemId: item.Id,
            deviceId: getDeviceId(),
            playSessionId: info.PlaySessionId,
            audioStreamIndex: audioSel !== null && audioSel !== defaultAudio ? audioSel : undefined,
            subtitleStreamIndex: burnSel === null ? undefined : burnSel,
            allowVideoStreamCopy: copyOk,
            maxHeight: fixed && fixed.maxHeight ? fixed.maxHeight : undefined,
            maxWidth: fixed && fixed.maxWidth ? fixed.maxWidth : undefined,
          });
        if (!source || !selection) {
          setError(true);
          return;
        }
        setLoaded({
          selection,
          url: resolveStreamUrl(client.serverUrl, selection.url, session.token),
          mediaSourceId: source.Id,
          playSessionId: info.PlaySessionId,
          source,
          audioIndex: chosen,
          startTicks: restartTicks.current,
          copyAllowed: copyOk && burnSel === null,
        });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, session, item.Id, audioSel, burnSel, probe, copyOk, qualitySel, autoCapped, requery, safe, isLocal, versions]);

  // A download: everything is on the device, so the stream is the saved playlist and no server is asked.
  useEffect(() => {
    if (!isLocal || !assets.ready) return;
    const text = assets.tracks;
    const def = text.filter((t) => t.isDefault)[0];
    setSubSel(pickInitialSubtitle(text, loadSubtitleLang(), def ? def.index : undefined));
    setProbe(false);
    const key = playlistKey(item.Id);
    setLoaded({
      selection: { method: 'DirectPlay', url: key, hls: true },
      url: resolveUri(window.location.href, key),
      mediaSourceId: assets.mediaSourceId,
      source: { Id: assets.mediaSourceId },
      audioIndex: null,
      startTicks: restartTicks.current,
      copyAllowed: false,
    });
  }, [isLocal, assets, item.Id]);

  // Attach the stream: native playback, or hls.js where the browser cannot play HLS itself.
  useEffect(() => {
    const el = video.current;
    if (!loaded || !el) return;
    const startSeconds = ticksToSeconds(loaded.startTicks);
    shift.current = 0;
    if (!isLocal) el.disableRemotePlayback = false;
    const seekToStart = () => {
      if (startSeconds > 0) el.currentTime = startSeconds;
    };
    let destroyed = false;
    let hls: { destroy(): void } | null = null;
    if (isLocal) {
      // A transcode's buffered media can start slightly after 0: jump that gap until playback has begun.
      let started = false;
      const ranges = (): Array<[number, number]> => {
        const out: Array<[number, number]> = [];
        for (let i = 0; i < el.buffered.length; i++) out.push([el.buffered.start(i), el.buffered.end(i)]);
        return out;
      };
      const jumpGap = () => {
        if (started) return;
        const target = startGapTarget(el.currentTime, ranges());
        if (target === null) return;
        el.currentTime = target;
        void el.play().catch(() => undefined);
      };
      const onTime = () => {
        const r = ranges();
        if (r.length > 0 && el.currentTime > r[0][0]) started = true;
      };
      const onPlayingLocal = () => {
        started = true;
      };
      const onLoadedLocal = () => {
        void el.play().catch(() => undefined);
        jumpGap();
      };
      el.addEventListener('loadedmetadata', onLoadedLocal);
      el.addEventListener('canplay', jumpGap);
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('playing', onPlayingLocal);
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            setError(true);
            return;
          }
          el.disableRemotePlayback = true;
          const instance = new Hls({
            loader: createCacheLoader(DOWNLOADS_CACHE),
            maxBufferHole: 0.5,
            startPosition: startSeconds > 0 ? startSeconds : -1,
          });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setError(true);
          });
          instance.on(Hls.Events.FRAG_BUFFERED, jumpGap);
          instance.loadSource(loaded.url);
          ownStream.current = true;
          instance.attachMedia(el);
        })
        .catch(() => {
          if (!destroyed) setError(true);
        });
      return () => {
        destroyed = true;
        el.removeEventListener('loadedmetadata', onLoadedLocal);
        el.removeEventListener('canplay', jumpGap);
        el.removeEventListener('timeupdate', onTime);
        el.removeEventListener('playing', onPlayingLocal);
        if (hls) hls.destroy();
      };
    }
    const onMeta = () => {
      seekToStart();
      // In a group the group's Unpause starts everybody together.
      if (!sync.holdStart()) void el.play().catch(() => undefined); // blocked autoplay: stays paused, the big play button starts it
    };
    // A failure before the first frame is retried once with the safe profile (same start, restartTicks); later ones show the error.
    let started = false;
    const onStarted = () => {
      started = true;
    };
    el.addEventListener('playing', onStarted);
    const fail = () => {
      if (destroyed) return;
      if (shouldRetrySafe({ safe, started })) {
        setBuffering(true);
        setLoaded(null);
        setSafe(true);
      } else setError(true);
    };
    // Native playback has no other way to report a failure; without this the spinner never ends.
    const onError = () => {
      if (el.error && el.error.code === 1) return; // MEDIA_ERR_ABORTED: we changed the source ourselves
      fail();
    };
    if (loaded.selection.hls && el.canPlayType(HLS_MIME) === '') {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            setError(true);
            return;
          }
          const instance = new Hls({ startPosition: startSeconds > 0 ? startSeconds : -1 });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail();
          });
          // The first segment fixes the shift. `startPosition` was in video time, so once the shift is known seek to
          // where the resume point really is. Only the first event: the user cannot have seeked before any data.
          let corrected = false;
          instance.on(Hls.Events.INIT_PTS_FOUND, (_event, data) => {
            shift.current = mpegTsShift(data.initPTS, data.timescale);
            if (corrected) return;
            corrected = true;
            if (startSeconds > 0 && shift.current !== 0) {
              el.currentTime = Math.max(0, toVideo(startSeconds));
            }
          });
          instance.loadSource(loaded.url);
          ownStream.current = true;
          instance.attachMedia(el);
          el.addEventListener('loadedmetadata', () => !sync.holdStart() && void el.play().catch(() => undefined), { once: true });
        })
        .catch(() => {
          if (!destroyed) setError(true);
        });
    } else {
      el.addEventListener('loadedmetadata', onMeta, { once: true });
      el.addEventListener('error', onError);
      ownStream.current = true;
      el.src = loaded.url;
    }
    return () => {
      destroyed = true;
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
      el.removeEventListener('playing', onStarted);
      if (hls) hls.destroy();
    };
  }, [loaded, isLocal, safe]);

  // Progress reporting: start once playing, every 10 s, on pause/play/seek, stopped exactly once.
  useEffect(() => {
    const el = video.current;
    if (!loaded || !el) return;
    let started = false;
    let stopped = false;
    const reporter = isTrailer ? silentReports : client;
    const report = (): PlaybackReport => ({
      itemId: item.Id,
      mediaSourceId: loaded.mediaSourceId,
      playSessionId: loaded.playSessionId,
      // A destroyed hls.js player resets the video to 0; the last time seen keeps the resume point.
      positionTicks: secondsToTicks(el.currentTime > 0 ? toMedia(el.currentTime) : lastTime.current),
      playMethod: loaded.selection.method,
      isPaused: el.paused,
      ...(loaded.audioIndex !== null ? { audioStreamIndex: loaded.audioIndex } : {}),
      subtitleStreamIndex: subIndex.current,
    });
    const reachable = () => typeof navigator === 'undefined' || navigator.onLine !== false;
    /** A download: keeps the position on this device and in the queue for Jellyfin, so offline progress is not lost. */
    const saveLocal = (played: boolean) => {
      const at = Date.now();
      const positionTicks = played ? 0 : report().positionTicks;
      saveLocalProgress(item.Id, { positionTicks, played, at });
      progress.enqueue({ itemId: item.Id, positionTicks, played, at });
    };
    const send = () => {
      if (!started || stopped) return;
      if (isLocal) saveLocal(false);
      if (!isLocal || reachable()) reporter.reportProgress(report()).catch(() => undefined);
    };
    const throttle = createThrottle(send, EVENT_REPORT_MS);
    const stop = (): Promise<void> => {
      if (!started || stopped) return Promise.resolve();
      stopped = true;
      if (!isLocal) {
        // keepalive: the page may be closing.
        return reporter.reportStopped(report(), true).catch(() => undefined);
      }
      const p = planRef.current;
      const finished = isFinished({
        ended: endedRef.current,
        marked: markedRef.current,
        positionSeconds: ticksToSeconds(report().positionTicks),
        creditsFromSeconds: p ? p.showAt : null,
      });
      saveLocal(finished);
      // Removed once the player has closed, not while it is still playing.
      if (shouldAutoDelete(item.Type, finished)) autoDelete.current = true;
      const told = reachable() ? reporter.reportStopped(report(), true).catch(() => undefined) : Promise.resolve();
      return told.then(() => progress.flush());
    };
    stopRef.current = stop;
    const onPlaying = () => {
      if (started) return;
      started = true;
      if (!isLocal || reachable()) reporter.reportStart(report()).catch(() => undefined);
    };
    const onEnded = () => {
      endedRef.current = true;
      if (advanceRef.current(false)) return;
      void stop();
      onBack();
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', throttle.call);
    el.addEventListener('play', throttle.call);
    el.addEventListener('seeked', throttle.call);
    el.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', stop);
    const timer = window.setInterval(send, PROGRESS_MS);
    return () => {
      window.clearInterval(timer);
      throttle.cancel();
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', throttle.call);
      el.removeEventListener('play', throttle.call);
      el.removeEventListener('seeked', throttle.call);
      el.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', stop);
      stopRef.current = () => Promise.resolve();
      void stop();
    };
  }, [client, loaded, item.Id, isLocal, isTrailer]);

  // Leaving for good stops the stream and the audio. Moving to another episode keeps the element so its gesture
  // unlock carries over; it only goes quiet until the next stream is attached. Declared after the effects that
  // stop hls.js and report progress, so their cleanups run first.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    return () => {
      if (advancing.current) el.pause();
      else releasePlayerVideo(el);
    };
  }, []);

  // A watched episode leaves the downloads once the player has closed (this cleanup runs after the one that stops
  // the video and saves the position). Movies stay.
  const latest = useRef({ downloads, toast });
  latest.current = { downloads, toast };
  useEffect(
    () => () => {
      if (!autoDelete.current) return;
      const { downloads: list, toast: say } = latest.current;
      void list
        .remove(item.Id)
        .then(() => say(removedToast(item.Name)))
        .catch(() => undefined);
    },
    [],
  );

  /**
   * Switches to another episode: reports Stopped for this one first and, with `markPlayed`, marks it played
   * (the server only does that itself near the end). Keeps fullscreen. A second call while switching does nothing.
   */
  const switchTo = (episode: BaseItem, markPlayed: boolean) => {
    if (advancing.current) return;
    advancing.current = true;
    if (markPlayed) markedRef.current = true;
    const done = stopRef.current();
    // A download's watched mark goes through the queue (see stop), which also works offline.
    if (markPlayed && !isLocal) void done.then(() => client.markPlayed(session.userId, item.Id)).catch(() => undefined);
    onPlayEpisode(episode);
  };
  /**
   * Autoplay: starts the next episode, marking this one played when it is cut off before the natural end.
   * False when there is no next episode or autoplay was cancelled, so the caller does what it did before.
   */
  const advance = (early: boolean): boolean => {
    if (advancing.current) return true;
    if (sync.active) {
      // The group moves everybody on (the server ignores the second request when several devices ask at once).
      if (!sync.hasNext || cancelled) return false;
      sync.next(early);
      return true;
    }
    if (!next || cancelled) return false;
    switchTo(next, early);
    return true;
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const plan = planNextEpisode(segments, ticksToSeconds(item.RunTimeTicks || 0));
  planRef.current = plan;
  // The buttons work with autoplay cancelled; only a next pressed in the credits counts the episode as watched.
  const episodeNav =
    item.Type === 'Episode'
      ? {
          hasPrevious: sync.active ? sync.hasPrevious : !!previous,
          hasNext: sync.active ? sync.hasNext : !!next,
          onPrevious: () => (sync.active ? sync.previous() : previous && switchTo(previous, false)),
          onNext: () => (sync.active ? sync.next(shouldMarkPlayedOnSkip(plan, now)) : next && switchTo(next, shouldMarkPlayedOnSkip(plan, now))),
        }
      : undefined;
  useMediaSession({
    video: () => video.current,
    item,
    serverUrl: client.serverUrl,
    getPosition: () => {
      const el = video.current;
      return el ? toMedia(el.currentTime) : 0;
    },
    getDuration: () => duration,
    onPlay: () => {
      const el = video.current;
      if (el && el.paused) togglePlay();
    },
    onPause: () => {
      const el = video.current;
      if (el && !el.paused) togglePlay();
    },
    onSeekBy: skipBy,
    onSeekTo: seekTo,
    onPrevious: episodeNav && episodeNav.hasPrevious ? episodeNav.onPrevious : undefined,
    onNext: episodeNav && episodeNav.hasNext ? episodeNav.onNext : undefined,
  });
  // Where the countdown started: when the position entered the card zone (playing, seeking or resuming).
  const armed = useRef<{ at: number | null; last: number | null }>({ at: null, last: null });
  armed.current = { at: nextArmedAt(plan, armed.current.at, armed.current.last, now), last: now };
  const card = next && !cancelled && !error ? nextEpisodeCard(plan, now, armed.current.at) : null;
  useEffect(() => {
    if (card && card.due) advanceRef.current(true);
  }, [card && card.due]);

  const intro = card && card.show ? null : activeIntro(segments, now);
  const skipIntro = () => {
    const el = video.current;
    if (!intro || !el) return;
    const end = ticksToSeconds(intro.endTicks);
    if (sync.active) return seekTo(end);
    el.currentTime = toVideo(end);
    setNow(end);
  };

  // Moving the mouse shows the controls (and restarts the hide timer, not on every event).
  const onMouseMove = () => {
    const t = Date.now();
    if (!shown || t - lastMove.current > MOVE_MS) {
      lastMove.current = t;
      interact();
    }
  };
  // The pointer leaving the player (or the browser window, the stage fills it) hides the controls at once instead
  // of after HIDE_MS, unless something keeps them up (paused, a menu or the scrub bar, still loading).
  const onMouseLeave = () => {
    lastMove.current = 0;
    if (!keepUp) setShown(false);
  };
  // A phone tap shows or hides the controls. With a mouse a click plays / pauses and a double click toggles fullscreen.
  const toggleControls = () => {
    if (shown && !busy) setShown(false);
    else interact();
  };
  // Phone: a double tap on the left or right skips 10 s back or forward; more taps on that side keep skipping.
  const skipFromTap = (side: TapSide) => {
    const dir = side === 'right' ? 1 : -1;
    skipBy(dir * TAP_SKIP_S);
    // The streak total only counts one direction.
    streakTotal.current = streakSide.current === side ? streakTotal.current + TAP_SKIP_S : TAP_SKIP_S;
    streakSide.current = side;
    setHint({ side, total: streakTotal.current, on: true });
    window.clearTimeout(streakTimer.current);
    streakTimer.current = window.setTimeout(() => {
      streakTimer.current = undefined;
      streakTotal.current = 0;
    }, SEEK_STREAK_MS);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint((h) => ({ ...h, on: false })), SEEK_HINT_MS);
  };
  const onTouchTap = (side: TapSide) => {
    if (streakTimer.current !== undefined && streakSide.current === side) {
      skipFromTap(side);
      return;
    }
    // Any other tap ends the streak.
    window.clearTimeout(streakTimer.current);
    streakTimer.current = undefined;
    streakTotal.current = 0;
    if (tapTimer.current !== undefined) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      if (side !== 'middle' && side === tapAt.current) skipFromTap(side);
      else if (side === tapAt.current) toggleControls();
      else startTap(side);
      return;
    }
    startTap(side);
  };
  const startTap = (side: TapSide) => {
    tapAt.current = side;
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      toggleControls();
    }, DOUBLE_TAP_MS);
  };
  const onStageClick = (e: MouseEvent) => {
    if (!mouse) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onTouchTap(tapSide(e.clientX, e.clientY, rect, rotated));
      return;
    }
    if (clickTimer.current !== undefined) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = undefined;
      toggleFullscreen();
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = undefined;
      togglePlay();
      interact();
    }, DOUBLE_CLICK_MS);
  };

  const label = item.Type === 'Episode' ? [item.SeriesName, episodeLabel(item)].filter(Boolean).join(' · ') : '';
  const subtitleText = subSel >= 0 && tracks[subSel] && !tracks[subSel].burnIn ? activeCueText(cues, now - subOffset / 1000) : '';
  return (
    <div class="player">
      {error ? (
        <div class="player-error">
          <button type="button" class="back" onClick={onBack} aria-label="Back">
            <Icon name="back" />
          </button>
          <p class="empty">Couldn't play this video.</p>
        </div>
      ) : (
        <div
          class={'player-stage' + (rotated ? ' rotated' : '') + (mouse ? (controlsUp ? ' up' : ' idle') : '')}
          onMouseMove={mouse ? onMouseMove : undefined}
          onMouseLeave={mouse ? onMouseLeave : undefined}
        >
          <div class="player-video-host" ref={attachVideo} />
          <div class="player-tap" onClick={onStageClick} />
          {!mouse ? (
            <div class={'seek-hint ' + hint.side + (hint.on ? ' on' : '')} aria-hidden="true">
              <div class="seek-hint-body">
                <Icon name={hint.side === 'left' ? 'rewind10' : 'forward10'} size={36} />
                <span>{(hint.side === 'left' ? '\u2212' : '+') + hint.total + ' s'}</span>
              </div>
            </div>
          ) : null}
          {subtitleText ? (
            <div class={'player-subs' + (controlsUp ? ' raised' : '')}>
              <span>{subtitleText}</span>
            </div>
          ) : null}
          <PlayerControls
            eyebrow={label}
            title={item.Name}
            visible={controlsUp}
            paused={paused}
            buffering={buffering || !loaded}
            position={now}
            duration={duration}
            buffered={buffered}
            rotated={rotated}
            tracks={tracks}
            selected={subSel}
            audioTracks={audioTracks}
            audioSelected={loaded ? loaded.audioIndex : null}
            qualityOptions={qualityChoices}
            qualitySelected={qualitySel}
            onSelectQuality={chooseQuality}
            onBack={onBack}
            onTogglePlay={togglePlay}
            onSkip={skipBy}
            onSeek={seekTo}
            onSelectSubtitle={chooseSubtitle}
            onSelectAudio={chooseAudio}
            onBusy={setBusy}
            episodeNav={episodeNav}
            together={sync.together ? { count: sync.together.participants.length, onOpen: () => setTogetherOpen(true) } : undefined}
            onInteract={interact}
            scrubSource={scrubSource}
            chapters={chapters}
            desktop={
              mouse
                ? {
                    volume: vol.volume,
                    muted: vol.muted,
                    fullscreen: isFullscreen,
                    canFullscreen: supportsElementFullscreen(),
                    onVolume: setVolume,
                    onToggleMute: toggleMute,
                    onToggleFullscreen: toggleFullscreen,
                  }
                : undefined
            }
          />
          {intro && (
            <button type="button" class="skip-intro-overlay" onClick={skipIntro}>
              Skip intro
              {mouse ? <Icon name="next" size={20} /> : null}
            </button>
          )}
          {next && card && card.show && (
            <NextEpisodeCard
              serverUrl={client.serverUrl}
              localArt={nextPosters[next.Id]}
              next={next}
              remaining={card.remaining}
              total={card.total}
              target="phone"
              onPlayNow={() => advance(true)}
              onCancel={() => setCancelled(true)}
            />
          )}
          {togetherOpen && sync.together ? (
            <TogetherSheet
              name={sync.together.name}
              participants={sync.together.participants}
              onLeave={() => {
                setTogetherOpen(false);
                sync.leave();
              }}
              onClose={() => setTogetherOpen(false)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
