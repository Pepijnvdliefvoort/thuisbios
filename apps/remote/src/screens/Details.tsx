import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CastSection } from '../components/CastSection';
import { ActionTile } from '../components/ActionTile';
import {
  DownloadButton,
  DownloadSeasonButton,
  QualitySheet,
  seasonDownloadLabel,
  seasonDownloadState,
  seasonQualityTitle,
} from '../components/DownloadButton';
import { Icon, type IconName } from '../components/Icon';
import { MenuSheet } from '../components/MenuSheet';
import { TrailerButton } from '../components/TrailerButton';
import { PullSpinner } from '../components/PullSpinner';
import { BackdropImg, Img } from '../components/Img';
import { CollectionDetails } from './CollectionDetails';
import { DetailsExtras } from '../components/DetailsExtras';
import { Skeleton } from '../components/Skeleton';
import { useApp } from '../context';
import { artUrl, artUrls } from '../jellyfin/art';
import { warmBitrate } from '../jellyfin/bitrate';
import { findPlayTarget, resumeTicks } from '../jellyfin/playTarget';
import { chooseSeasonId } from '../jellyfin/seasons';
import { episodeLabel, formatRuntime, formatTicksClock, progressFraction } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';
import { primePlayerVideo } from '../playerVideo';
import { resolveStart } from '../offline/startPosition';
import { canAddToList, isInList, myListToggle } from '../jellyfin/myList';
import { allWatched, isWatched, watchedToggle, type WatchedScope } from '../jellyfin/watched';
import { useAsync, useRegisterReload, type Reloaders } from '../useAsync';
import { useDesktop } from '../useDesktop';
import { useScrollLock } from '../useScrollLock';
import { splitQuickActions, type QuickActionId } from '../detailsActions';
import { trailerSource } from '../jellyfin/trailers';
import { isDownloadable } from '../offline/downloadIndex';
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
      {item.data && item.data.Type === 'BoxSet' ? <CollectionDetails item={item.data} reloaders={reloaders} /> : null}
      {item.data && item.data.Type !== 'BoxSet' ? <DetailsBody item={item.data} reloaders={reloaders} refresh={refresh} /> : null}
      {item.loading && !item.data ? desktop ? <DetailsSkeleton /> : <PhoneDetailsSkeleton /> : null}
      {item.error ? <p class="empty pad-top">Couldn't load this item.</p> : null}
    </div>
  );
}

/** Phone placeholder while the item loads: hero image, title, a meta line, buttons and a few text lines. */
function PhoneDetailsSkeleton() {
  return (
    <div class="details-skel-phone" role="status" aria-label="Loading">
      <Skeleton class="skel-hero" />
      <div class="skel-body">
        <Skeleton class="skel-title" />
        <div class="skel-row">
          <Skeleton class="skel-chip" />
          <Skeleton class="skel-chip" />
          <Skeleton class="skel-chip wide" />
        </div>
        <div class="skel-play-row">
          <Skeleton class="skel-button primary" />
        </div>
        <div class="skel-tiles">
          <Skeleton class="skel-flat" />
          <Skeleton class="skel-flat" />
          <Skeleton class="skel-flat" />
          <Skeleton class="skel-flat" />
        </div>
        <Skeleton class="skel-line" />
        <Skeleton class="skel-line mid" />
        <Skeleton class="skel-line short" />
      </div>
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
  const { client, session, tv, toast, openItem, playHere, downloads, offline, refreshLibrary, syncplay } = useApp();
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

  // Watch together: a group (Jellyfin SyncPlay) that starts this item from the resume point; it always plays in this app's player.
  const startTogether = async () => {
    primePlayerVideo(); // inside the tap, before anything async (iOS)
    if (playItem && !syncplay.busy && (await syncplay.create(playItem, serverResume))) playHere(playItem, serverResume, true);
  };

  // My list works like the watched toggle: the tap shows at once and is dropped when the item reloads or the call fails.
  const [listPending, setListPending] = useState<boolean | null>(null);
  const inList = listPending !== null ? listPending : isInList(item);
  const listToggle = myListToggle(inList);
  const toggleList = async () => {
    const next = listToggle.next;
    setListPending(next);
    try {
      if (next) await client.addToList(session.userId, item.Id);
      else await client.removeFromList(session.userId, item.Id);
    } catch {
      toast("Couldn't update My list");
      setListPending(null);
      return;
    }
    await refresh();
    setListPending(null);
    refreshLibrary();
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
      {playItem && !offline ? (
        <button type="button" class="btn secondary" disabled={syncplay.busy || !!syncplay.group} onClick={() => void startTogether()}>
          <Icon name="group" size={20} /> Watch together
        </button>
      ) : null}
      {isSeries ? null : <DownloadButton item={item} />}
      {isEpisode ? null : <TrailerButton item={item} />}
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
      {canAddToList(item) && !offline ? (
        <button
          type="button"
          class={inList ? 'btn secondary is-listed' : 'btn secondary'}
          aria-pressed={inList}
          onClick={() => void toggleList()}
        >
          <Icon name={listToggle.icon} size={20} /> {listToggle.label}
        </button>
      ) : null}
    </div>
  );
  const overview = item.Overview ? <p class="overview">{item.Overview}</p> : null;

  // Phone: one play row (primary button with the resume progress inside, restart square), a flat row of icon tiles and a "More" sheet.
  const [moreOpen, setMoreOpen] = useState(false);
  const total = playItem ? playItem.RunTimeTicks || 0 : 0;
  const left = total > resume ? formatRuntime(total - resume) : '';
  const resuming = resume > 0 && !!playItem;
  const primary =
    resuming && playItem ? (
      <button type="button" class="btn primary play-main" disabled={disabled} onClick={() => start(playItem, resume)}>
        <Icon name="play" />
        <span class="btn-label">{here ? 'Resume' : 'Resume on TV'}</span>
        <span class="btn-sub">{left ? `· ${left} left` : `· from ${formatTicksClock(resume)}`}</span>
        {total > 0 ? (
          <span class="btn-progress" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.min(1, resume / total) * 100)}%` }} />
          </span>
        ) : null}
      </button>
    ) : (
      <button type="button" class="btn primary play-main" disabled={disabled} onClick={() => playItem && start(playItem, 0)}>
        <Icon name="play" /> {(isSeries ? 'Play next episode' : 'Play') + (here ? '' : ' on TV')}
      </button>
    );
  const playRow = (
    <div class="play-row">
      {primary}
      {resuming && playItem ? (
        <button type="button" class="restart-btn" disabled={disabled} aria-label="Play from start" title="Play from start" onClick={() => start(playItem, 0)}>
          <Icon name="restart" size={22} />
        </button>
      ) : null}
    </div>
  );
  const quickIds: QuickActionId[] = [];
  if (canAddToList(item) && !offline) quickIds.push('list');
  if (!isEpisode && !offline && !!trailerSource(item)) quickIds.push('trailer');
  if (!isSeries && downloads.supported && isDownloadable(item)) quickIds.push('download');
  quickIds.push('watched');
  if (playItem && !offline) quickIds.push('together');
  const { row, more } = splitQuickActions(quickIds);
  const watchedAria = watched ? 'Watched, tap to mark unwatched' : toggle.label;
  const together = (
    <ActionTile
      key="together"
      label="Together"
      ariaLabel="Watch together"
      disabled={syncplay.busy || !!syncplay.group}
      onClick={() => void startTogether()}
    >
      <Icon name="group" size={24} />
    </ActionTile>
  );
  const tile = (id: QuickActionId) => {
    switch (id) {
      case 'list':
        return (
          <ActionTile key={id} label={listToggle.label} on={inList} pressed={inList} onClick={() => void toggleList()}>
            <Icon name={listToggle.icon} size={24} />
          </ActionTile>
        );
      case 'trailer':
        return <TrailerButton key={id} item={item} variant="tile" />;
      case 'download':
        return <DownloadButton key={id} item={item} variant="tile" />;
      case 'together':
        return together;
      default:
        return (
          <ActionTile key={id} label="Watched" ariaLabel={watchedAria} on={watched} pressed={watched} onClick={() => void toggleWatched()}>
            <Icon name={watched ? 'watched' : 'unwatched'} size={24} />
          </ActionTile>
        );
    }
  };
  const hasSheet = more.length > 0 || !noTv;
  const phoneActions = (
    <div class="details-actions">
      {isSeries && playItem ? (
        <p class="next-ep">
          Next episode: {episodeLabel(playItem)} {playItem.Name}
        </p>
      ) : null}
      {playRow}
      <div class="quick-actions">
        {row.map(tile)}
        {hasSheet ? (
          <ActionTile key="more" class="details-more-btn" label="More" ariaLabel="More actions" onClick={() => setMoreOpen(true)}>
            <Icon name="more" size={24} />
          </ActionTile>
        ) : null}
      </div>
      {moreOpen ? (
        <DetailsMoreSheet
          item={item}
          onClose={() => setMoreOpen(false)}
          entries={[
            ...(more.includes('watched')
              ? [{ key: 'watched', icon: watched ? ('watched' as const) : ('unwatched' as const), label: toggle.label, disabled: false, run: () => void toggleWatched() }]
              : []),
            ...(more.includes('together')
              ? [{ key: 'together', icon: 'group' as const, label: 'Watch together', disabled: syncplay.busy || !!syncplay.group, run: () => void startTogether() }]
              : []),
            ...(noTv ? [] : [{ key: 'tv', icon: 'eye' as const, label: 'Show on TV', disabled: false, run: () => void send(tv.show(item)) }]),
          ]}
        />
      ) : null}
    </div>
  );
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
        <div class="details-content">
          {episodes}
          <CastSection item={item} />
          <DetailsExtras item={item} />
        </div>
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
          {phoneActions}
        </div>
        {item.Overview ? <PhoneOverview key={item.Id} text={item.Overview} /> : null}
        {genres}
        {episodes}
        <CastSection item={item} />
        <DetailsExtras item={item} />
      </div>
    </>
  );
}

type MoreEntry = { key: string; icon: IconName; label: string; disabled: boolean; run: () => void };

/** The "More" sheet of the phone details page: the actions that did not fit in the row, and Show on TV. */
function DetailsMoreSheet({ item, entries, onClose }: { item: BaseItem; entries: MoreEntry[]; onClose: () => void }) {
  return <EntrySheet title={item.Name} entries={entries} onClose={onClose} />;
}

/** A titled sheet of `btn secondary menu-row` entries; each entry runs and then closes the sheet. */
function EntrySheet({ title, entries, onClose }: { title: string; entries: MoreEntry[]; onClose: () => void }) {
  useScrollLock();
  return (
    <MenuSheet label={title} onClose={onClose}>
      <h2>{title}</h2>
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          class="btn secondary menu-row"
          disabled={e.disabled}
          onClick={() => {
            e.run();
            onClose();
          }}
        >
          <Icon name={e.icon} size={20} /> {e.label}
        </button>
      ))}
    </MenuSheet>
  );
}

/** Phone overview, clamped to four lines with a More / Less toggle that shows only when the text overflows. */
function PhoneOverview({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);
  return (
    <div class="overview-wrap">
      <p class={expanded ? 'overview' : 'overview clamped'} ref={ref}>
        {text}
      </p>
      {overflows || expanded ? (
        <button type="button" class="overview-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
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
  // Phone: the season actions sit behind one button next to the heading; the quality sheet is opened from here so it outlives the menu.
  const [seasonMenu, setSeasonMenu] = useState(false);
  const [seasonQuality, setSeasonQuality] = useState(false);
  const seasonName = (seasons.data || []).find((x) => x.Id === seasonId)?.Name || 'Season';
  const seasonDl = seasonDownloadState(list, downloads.get);
  const showSeasonTools = !!seasonId && list.length > 0;
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
      {!desktop && showSeasonTools ? (
        <div class="episodes-head">
          <h2>{onEpisodePage ? 'More episodes' : 'Episodes'}</h2>
          <button type="button" class="season-more" aria-label="Season actions" onClick={() => setSeasonMenu(true)}>
            <Icon name="more" size={24} />
          </button>
        </div>
      ) : (
        <h2>{onEpisodePage ? 'More episodes' : 'Episodes'}</h2>
      )}
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
      {desktop && showSeasonTools && seasonId ? (
        <div class="season-tools">
          <button type="button" class="btn-small" onClick={() => void change(seasonId, seasonToggle.next, list)}>
            <Icon name={seasonToggle.next ? 'unwatched' : 'watched'} size={18} /> {seasonToggle.label}
          </button>
          <DownloadSeasonButton episodes={list} />
        </div>
      ) : null}
      {seasonMenu && seasonId ? (
        <EntrySheet
          title={seasonName}
          entries={[
            {
              key: 'watched',
              icon: seasonToggle.next ? 'unwatched' : 'watched',
              label: seasonToggle.label,
              disabled: false,
              run: () => void change(seasonId, seasonToggle.next, list),
            },
            ...(downloads.supported
              ? [
                  {
                    key: 'download',
                    icon: seasonDl.none ? ('check' as const) : ('download' as const),
                    label: seasonDownloadLabel(seasonDl.none, seasonDl.allDone),
                    disabled: seasonDl.none,
                    run: () => setSeasonQuality(true),
                  },
                ]
              : []),
          ]}
          onClose={() => setSeasonMenu(false)}
        />
      ) : null}
      {seasonQuality ? (
        <QualitySheet
          title={seasonQualityTitle(seasonDl.todo.length)}
          items={seasonDl.todo}
          onClose={() => setSeasonQuality(false)}
          onConfirm={(q) => {
            setSeasonQuality(false);
            void downloads.enqueue(seasonDl.todo, q);
          }}
        />
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
