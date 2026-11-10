import { useEffect, useRef, useState } from 'preact/hooks';
import { DownloadButton, DownloadSeasonButton } from '../components/DownloadButton';
import { Icon } from '../components/Icon';
import { PullSpinner } from '../components/PullSpinner';
import { BackdropImg, Img } from '../components/Img';
import { Skeleton } from '../components/Skeleton';
import { useApp } from '../context';
import { artUrl, artUrls } from '../jellyfin/art';
import { warmBitrate } from '../jellyfin/bitrate';
import { findPlayTarget, resumeTicks } from '../jellyfin/playTarget';
import { chooseSeasonId } from '../jellyfin/seasons';
import { episodeLabel, formatRuntime, formatTicksClock, progressFraction } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';
import { resolveStart } from '../offline/startPosition';
import { allWatched, isWatched, watchedToggle, type WatchedScope } from '../jellyfin/watched';
import { useAsync, useRegisterReload, type Reloaders } from '../useAsync';
import { useDesktop } from '../useDesktop';
import { usePullToRefresh } from '../usePullToRefresh';

/** Marks an item (or a season or series, which Jellyfin applies to all episodes) watched or unwatched, then refreshes. */
function useSetWatched(refresh: () => Promise<unknown>) {
  const { client, session, toast, refreshLibrary } = useApp();
  return async (id: string, played: boolean): Promise<boolean> => {
    try {
      if (played) await client.markPlayed(session.userId, id);
      else await client.markUnplayed(session.userId, id);
    } catch {
      toast("Couldn't update watched state");
      return false;
    }
    await refresh();
    refreshLibrary();
    return true;
  };
}

export function Details({ id, onBack }: { id: string; onBack: () => void }) {
  const { client, session, offline } = useApp();
  // Measure the connection now, so pressing Play does not wait for it.
  useEffect(() => {
    if (!offline) warmBitrate(client);
  }, [client, offline]);
  const item = useAsync(() => client.item(session.userId, id), [client, session.userId, id]);
  // Children (next episode, seasons, episodes) register their reloads here so a pull refreshes them too.
  const reloaders = useRef(new Set<() => Promise<void>>());
  const pageRef = useRef<HTMLDivElement>(null);
  const refresh = () => Promise.all([item.reload(), ...Array.from(reloaders.current, (reload) => reload())]);
  const pull = usePullToRefresh(pageRef, refresh);
  const desktop = useDesktop();
  return (
    <div class="details" ref={pageRef}>
      <PullSpinner pull={pull} />
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      {item.data ? <DetailsBody item={item.data} reloaders={reloaders} refresh={refresh} /> : null}
      {item.loading && !item.data ? desktop ? <DetailsSkeleton /> : <p class="hint pad-top">Loading...</p> : null}
      {item.error ? <p class="empty pad-top">Couldn't load this item.</p> : null}
    </div>
  );
}

/** Desktop placeholder for the cinematic header while the item loads. */
function DetailsSkeleton() {
  return (
    <div class="details-hero details-skel" role="status" aria-label="Loading">
      <div class="hero-fade" />
      <div class="details-hero-body">
        <Skeleton class="skel-title" />
        <div class="skel-row">
          <Skeleton class="skel-chip" />
          <Skeleton class="skel-chip" />
          <Skeleton class="skel-chip wide" />
        </div>
        <Skeleton class="skel-line" />
        <Skeleton class="skel-line mid" />
        <div class="skel-row skel-buttons">
          <Skeleton class="skel-button primary" />
          <Skeleton class="skel-button" />
          <Skeleton class="skel-button" />
        </div>
      </div>
    </div>
  );
}

function DetailsBody({ item, reloaders, refresh }: { item: BaseItem; reloaders: Reloaders; refresh: () => Promise<unknown> }) {
  const { client, session, tv, toast, openItem, playHere, downloads } = useApp();
  const desktop = useDesktop();
  const isSeries = item.Type === 'Series';
  const isEpisode = item.Type === 'Episode';
  // For a series, "play" means the episode to watch next.
  const target = useAsync<BaseItem | null>(
    () => findPlayTarget(client, session.userId, item),
    [client, session.userId, item.Id],
  );

  useRegisterReload(reloaders, target.reload);
  const playItem = target.data;
  const serverResume = playItem ? resumeTicks(playItem) : 0;
  const noTv = !tv.tv;
  const disabled = !playItem;

  // The tapped state shows at once; it is dropped when the refreshed item arrives (or the change failed).
  const [pending, setPending] = useState<boolean | null>(null);
  const setWatched = useSetWatched(refresh);
  const scope: WatchedScope = isSeries ? 'series' : 'item';
  const watched = pending !== null ? pending : isWatched(item);
  const toggle = watchedToggle(scope, watched);
  const toggleWatched = async () => {
    setPending(toggle.next);
    await setWatched(item.Id, toggle.next);
    setPending(null);
  };

  const send = async (action: Promise<boolean>) => {
    if (await action) toast('Sent to TV');
  };

  // Without a TV the video plays in the app's own player; a desktop does that even with a TV connected
  // (and then offers "Play on TV" next to it).
  const here = noTv || desktop;
  // A downloaded copy plays from the device; its resume point is the newest of this device's and the server's.
  const resume = playItem && here ? resolveStart(downloads.entries, playItem, serverResume) : serverResume;
  const start = (target: BaseItem, ticks: number) => {
    if (here) playHere(target, ticks);
    else void send(tv.play(target, ticks));
  };

  // The hero spans the window on a desktop.
  const [backdropW, backdropH] = desktop ? [1920, 1080] : [780, 440];
  const meta = [
    isEpisode ? episodeLabel(item) : item.ProductionYear ? String(item.ProductionYear) : '',
    item.OfficialRating,
    formatRuntime(item.RunTimeTicks),
    item.CommunityRating ? `★ ${item.CommunityRating.toFixed(1)}` : '',
  ].filter(Boolean);

  const eyebrow =
    isEpisode && item.SeriesName ? (
      item.SeriesId ? (
        <button type="button" class="eyebrow eyebrow-link" onClick={() => openItem(item.SeriesId as string)}>
          {item.SeriesName} <span aria-hidden="true">›</span>
        </button>
      ) : (
        <p class="eyebrow">{item.SeriesName}</p>
      )
    ) : null;
  const actions = (
    <div class="actions">
      {isSeries && playItem ? (
        <p class="next-ep">
          Next episode: {episodeLabel(playItem)} {playItem.Name}
        </p>
      ) : null}
      {resume > 0 && playItem ? (
        <>
          <button type="button" class="btn primary" disabled={disabled} onClick={() => start(playItem, resume)}>
            <Icon name="play" /> {here ? 'Resume' : 'Resume on TV'} ({formatTicksClock(resume)})
          </button>
          <button type="button" class="btn secondary" disabled={disabled} onClick={() => start(playItem, 0)}>
            <Icon name="restart" size={20} /> Play from start
          </button>
        </>
      ) : (
        <button type="button" class="btn primary" disabled={disabled} onClick={() => playItem && start(playItem, 0)}>
          <Icon name="play" /> {(isSeries ? 'Play next episode' : 'Play') + (here ? '' : ' on TV')}
        </button>
      )}
      {isSeries ? null : <DownloadButton item={item} />}
      {desktop && !noTv ? (
        <button type="button" class="btn secondary" disabled={disabled} onClick={() => playItem && void send(tv.play(playItem, serverResume))}>
          <Icon name="tv" size={20} /> {serverResume > 0 ? 'Resume on TV' : 'Play on TV'}
        </button>
      ) : null}
      <div class="action-row">
        <button type="button" class="btn secondary" disabled={noTv} onClick={() => void send(tv.show(item))}>
          <Icon name="eye" size={20} /> Show on TV
        </button>
        <button
          type="button"
          class={watched ? 'btn secondary is-watched' : 'btn secondary'}
          aria-pressed={watched}
          title={watched ? 'Tap to mark unwatched' : undefined}
          onClick={() => void toggleWatched()}
        >
          <Icon name={watched ? 'watched' : 'unwatched'} size={20} /> {toggle.label}
        </button>
      </div>
      {noTv && !desktop ? <p class="hint small">No TV connected, so this plays on your phone.</p> : null}
    </div>
  );
  const overview = item.Overview ? <p class="overview">{item.Overview}</p> : null;
  const genres = item.Genres && item.Genres.length > 0 ? <p class="genres">{item.Genres.join(' · ')}</p> : null;
  const episodes = isSeries ? (
    <Episodes
      seriesId={item.Id}
      initialSeasonId={playItem ? playItem.SeasonId : undefined}
      currentEpisodeId={playItem ? playItem.Id : undefined}
      onOpen={openItem}
      reloaders={reloaders}
      refresh={refresh}
    />
  ) : isEpisode && item.SeriesId ? (
    <Episodes
      seriesId={item.SeriesId}
      initialSeasonId={item.SeasonId}
      currentEpisodeId={item.Id}
      onEpisodePage
      onOpen={openItem}
      reloaders={reloaders}
      refresh={refresh}
    />
  ) : null;

  // Desktop: a cinematic header. The backdrop fills the top of the page (under the top bar) and the text and buttons sit
  // on it, bottom left; the poster is left out because the backdrop already carries the art.
  if (desktop) {
    return (
      <>
        <div class="details-hero">
          {/* The backdrop, or a blurred, enlarged copy of the poster when it is missing or fails to load. */}
          <BackdropImg
            class="hero-img"
            blurClass="hero-blur"
            backdrops={artUrls(client.serverUrl, item, 'backdrop', backdropW, backdropH)}
            poster={artUrl(client.serverUrl, item, 'poster', 480, 720)}
          />
          <div class="hero-fade" />
          <div class="details-hero-body">
            {eyebrow}
            <h1>{item.Name}</h1>
            <p class="meta meta-badges">
              {meta.map((m) =>
                m === item.OfficialRating ? (
                  <span key={m} class="rating-badge">
                    {m}
                  </span>
                ) : (
                  <span key={m}>{m}</span>
                ),
              )}
            </p>
            {overview}
            {genres}
            {actions}
          </div>
        </div>
        <div class="details-content">{episodes}</div>
      </>
    );
  }

  return (
    <>
      <div class="hero">
        <Img class="hero-img" src={artUrls(client.serverUrl, item, 'backdrop', backdropW, backdropH)} />
        <div class="hero-fade" />
      </div>
      <div class="details-content">
        <div class="details-head">
          <div class="details-main">
            <Img class="poster" src={artUrl(client.serverUrl, item, 'poster', 240, 360)} />
            <div class="details-text">
              {eyebrow}
              <h1>{item.Name}</h1>
              <p class="meta">{meta.join('  ·  ')}</p>
            </div>
          </div>
          {actions}
        </div>
        {overview}
        {genres}
        {episodes}
      </div>
    </>
  );
}

function Episodes({
  seriesId,
  initialSeasonId,
  currentEpisodeId,
  onEpisodePage = false,
  onOpen,
  reloaders,
  refresh,
}: {
  seriesId: string;
  initialSeasonId?: string;
  currentEpisodeId?: string;
  /** True on an episode's own page: heading and current-row label differ. */
  onEpisodePage?: boolean;
  onOpen: (id: string) => void;
  reloaders: Reloaders;
  refresh: () => Promise<unknown>;
}) {
  const { client, session, tv, toast, playHere, downloads } = useApp();
  const desktop = useDesktop();
  const seasons = useAsync(() => client.seasons(session.userId, seriesId), [client, session.userId, seriesId]);
  const [picked, setPicked] = useState<string | null>(null);
  // Follows initialSeasonId (it may load late) until the user taps a pill.
  const seasonId = chooseSeasonId(picked, initialSeasonId, seasons.data);
  const episodes = useAsync<BaseItem[]>(
    () => (seasonId ? client.episodes(session.userId, seriesId, seasonId) : Promise.resolve([])),
    [client, session.userId, seriesId, seasonId],
  );
  // Taps that are not confirmed by a refresh yet, by episode id.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const setWatched = useSetWatched(refresh);
  const list = episodes.data || [];
  const isPlayed = (ep: BaseItem) => (ep.Id in pending ? pending[ep.Id] : isWatched(ep));
  const seasonToggle = watchedToggle('season', allWatched(list, pending));
  const change = async (id: string, next: boolean, affected: BaseItem[]) => {
    const marks: Record<string, boolean> = {};
    affected.forEach((ep) => (marks[ep.Id] = next));
    setPending((p) => ({ ...p, ...marks }));
    await setWatched(id, next);
    setPending({});
  };
  useRegisterReload(reloaders, seasons.reload);
  useRegisterReload(reloaders, episodes.reload);
  return (
    <section class="episodes">
      <h2>{onEpisodePage ? 'More episodes' : 'Episodes'}</h2>
      {seasons.data && seasons.data.length > 0 ? (
        <div class="seasons" role="tablist">
          {seasons.data.map((s) => (
            <button
              key={s.Id}
              type="button"
              role="tab"
              aria-selected={s.Id === seasonId}
              class={s.Id === seasonId ? 'pill active' : 'pill'}
              onClick={() => setPicked(s.Id)}
            >
              {s.Name}
            </button>
          ))}
        </div>
      ) : null}
      {seasonId && list.length > 0 ? (
        <div class="season-tools">
          <button type="button" class="btn-small" onClick={() => void change(seasonId, seasonToggle.next, list)}>
            <Icon name={seasonToggle.next ? 'unwatched' : 'watched'} size={18} /> {seasonToggle.label}
          </button>
          <DownloadSeasonButton episodes={list} />
        </div>
      ) : null}
      {episodes.loading && !episodes.data ? <p class="hint">Loading...</p> : null}
      <ul class="ep-list">
        {list.map((ep) => {
          const progress = progressFraction(ep.UserData, ep.RunTimeTicks);
          const from = resumeTicks(ep);
          const played = isPlayed(ep);
          const current = ep.Id === currentEpisodeId;
          const saved = !desktop && (downloads.get(ep.Id) || { state: '' }).state === 'done';
          return (
            <li key={ep.Id} class={current ? 'ep current' : 'ep'}>
              <button type="button" class="ep-open" onClick={() => onOpen(ep.Id)}>
                <span class="ep-art">
                  <Img src={artUrl(client.serverUrl, ep, 'thumb', desktop ? 480 : 320, desktop ? 270 : 180)} />
                  {saved ? (
                    <span class="dl-mark" role="img" aria-label="Downloaded">
                      <Icon name="downloadDone" size={14} />
                    </span>
                  ) : null}
                  {played ? (
                    <span class="ep-check" role="img" aria-label="Watched">
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                  {progress > 0 ? (
                    <span class="progress">
                      <i style={{ width: `${Math.round(progress * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
                <span class="ep-text">
                  <span class="ep-title">
                    {ep.IndexNumber !== undefined ? `${ep.IndexNumber}. ` : ''}
                    {ep.Name}
                  </span>
                  <span class="ep-sub">
                    {current ? (onEpisodePage ? 'Now viewing · ' : 'Up next · ') : ''}
                    {formatRuntime(ep.RunTimeTicks)}
                    {saved ? <span class="dl-done"> · Downloaded</span> : null}
                  </span>
                  {desktop && ep.Overview ? <span class="ep-overview">{ep.Overview}</span> : null}
                </span>
              </button>
              <button
                type="button"
                class={played ? 'ep-watch on' : 'ep-watch'}
                aria-pressed={played}
                aria-label={played ? `Mark ${ep.Name} unwatched` : `Mark ${ep.Name} watched`}
                onClick={() => void change(ep.Id, !played, [ep])}
              >
                <Icon name={played ? 'watched' : 'unwatched'} size={22} />
              </button>
              <DownloadButton item={ep} variant="icon" />
              <button
                type="button"
                class="ep-play"
                aria-label={tv.tv && !desktop ? `Play ${ep.Name} on TV` : `Play ${ep.Name}`}
                onClick={async () => {
                  if (!tv.tv || desktop) playHere(ep, resolveStart(downloads.entries, ep, from));
                  else if (await tv.play(ep, from)) toast('Sent to TV');
                }}
              >
                <Icon name="play" size={26} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
