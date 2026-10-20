import { useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { PullSpinner } from '../components/PullSpinner';
import { Img } from '../components/Img';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { chooseSeasonId } from '../jellyfin/seasons';
import { episodeLabel, formatRuntime, formatTicksClock, progressFraction } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';
import { useAsync, useRegisterReload, type Reloaders } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

/** Ticks to resume from: the saved position, ignored when it is basically the start. */
export const resumeTicks = (item: BaseItem): number => {
  const t = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
  return t > 100_000_000 ? t : 0; // under 10 s counts as "not started"
};

export function Details({ id, onBack }: { id: string; onBack: () => void }) {
  const { client, session } = useApp();
  const item = useAsync(() => client.item(session.userId, id), [client, session.userId, id]);
  // Children (next episode, seasons, episodes) register their reloads here so a pull refreshes them too.
  const reloaders = useRef(new Set<() => Promise<void>>());
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () =>
    Promise.all([item.reload(), ...Array.from(reloaders.current, (reload) => reload())]),
  );
  return (
    <div class="details" ref={pageRef}>
      <PullSpinner pull={pull} />
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      {item.data ? <DetailsBody item={item.data} reloaders={reloaders} /> : null}
      {item.loading && !item.data ? <p class="hint pad-top">Loading...</p> : null}
      {item.error ? <p class="empty pad-top">Couldn't load this item.</p> : null}
    </div>
  );
}

function DetailsBody({ item, reloaders }: { item: BaseItem; reloaders: Reloaders }) {
  const { client, session, tv, toast, openItem, playOnPhone } = useApp();
  const isSeries = item.Type === 'Series';
  const isEpisode = item.Type === 'Episode';
  // For a series, "play" means the episode to watch next.
  const target = useAsync<BaseItem | null>(async () => {
    if (!isSeries) return item;
    const up = await client.nextUp(session.userId, 1, item.Id);
    if (up[0]) return up[0];
    const seasons = await client.seasons(session.userId, item.Id);
    if (!seasons[0]) return null;
    const eps = await client.episodes(session.userId, item.Id, seasons[0].Id);
    return eps[0] || null;
  }, [client, session.userId, item.Id]);

  useRegisterReload(reloaders, target.reload);
  const playItem = target.data;
  const resume = playItem ? resumeTicks(playItem) : 0;
  const noTv = !tv.tv;
  const disabled = !playItem;

  const send = async (action: Promise<boolean>) => {
    if (await action) toast('Sent to TV');
  };

  // Without a TV the video plays on the phone itself.
  const start = (target: BaseItem, ticks: number) => {
    if (noTv) playOnPhone(target, ticks);
    else void send(tv.play(target, ticks));
  };

  const meta = [
    isEpisode ? episodeLabel(item) : item.ProductionYear ? String(item.ProductionYear) : '',
    item.OfficialRating,
    formatRuntime(item.RunTimeTicks),
    item.CommunityRating ? `★ ${item.CommunityRating.toFixed(1)}` : '',
  ].filter(Boolean);

  return (
    <>
      <div class="hero">
        <Img class="hero-img" src={artUrl(client.serverUrl, item, 'backdrop', 780, 440)} />
        <div class="hero-fade" />
      </div>
      <div class="details-main">
        <Img class="poster" src={artUrl(client.serverUrl, item, 'poster', 240, 360)} />
        <div class="details-text">
          {isEpisode && item.SeriesName ? (
            item.SeriesId ? (
              <button type="button" class="eyebrow eyebrow-link" onClick={() => openItem(item.SeriesId as string)}>
                {item.SeriesName} <span aria-hidden="true">›</span>
              </button>
            ) : (
              <p class="eyebrow">{item.SeriesName}</p>
            )
          ) : null}
          <h1>{item.Name}</h1>
          <p class="meta">{meta.join('  ·  ')}</p>
        </div>
      </div>

      <div class="actions">
        {isSeries && playItem ? (
          <p class="next-ep">
            Next episode: {episodeLabel(playItem)} {playItem.Name}
          </p>
        ) : null}
        {resume > 0 && playItem ? (
          <>
            <button type="button" class="btn primary" disabled={disabled} onClick={() => start(playItem, resume)}>
              <Icon name="play" /> {noTv ? 'Resume' : 'Resume on TV'} ({formatTicksClock(resume)})
            </button>
            <button type="button" class="btn secondary" disabled={disabled} onClick={() => start(playItem, 0)}>
              <Icon name="restart" size={20} /> Play from start
            </button>
          </>
        ) : (
          <button type="button" class="btn primary" disabled={disabled} onClick={() => playItem && start(playItem, 0)}>
            <Icon name="play" /> {(isSeries ? 'Play next episode' : 'Play') + (noTv ? '' : ' on TV')}
          </button>
        )}
        <button type="button" class="btn secondary" disabled={noTv} onClick={() => void send(tv.show(item))}>
          <Icon name="eye" size={20} /> Show on TV
        </button>
        {noTv ? <p class="hint small">No TV connected, so this plays on your phone.</p> : null}
      </div>

      {item.Overview ? <p class="overview">{item.Overview}</p> : null}
      {item.Genres && item.Genres.length > 0 ? <p class="genres">{item.Genres.join(' · ')}</p> : null}

      {isSeries ? (
        <Episodes
          seriesId={item.Id}
          initialSeasonId={playItem ? playItem.SeasonId : undefined}
          currentEpisodeId={playItem ? playItem.Id : undefined}
          onOpen={openItem}
          reloaders={reloaders}
        />
      ) : null}
      {isEpisode && item.SeriesId ? (
        <Episodes
          seriesId={item.SeriesId}
          initialSeasonId={item.SeasonId}
          currentEpisodeId={item.Id}
          onEpisodePage
          onOpen={openItem}
          reloaders={reloaders}
        />
      ) : null}
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
}: {
  seriesId: string;
  initialSeasonId?: string;
  currentEpisodeId?: string;
  /** True on an episode's own page: heading and current-row label differ. */
  onEpisodePage?: boolean;
  onOpen: (id: string) => void;
  reloaders: Reloaders;
}) {
  const { client, session, tv, toast, playOnPhone } = useApp();
  const seasons = useAsync(() => client.seasons(session.userId, seriesId), [client, session.userId, seriesId]);
  const [picked, setPicked] = useState<string | null>(null);
  // Follows initialSeasonId (it may load late) until the user taps a pill.
  const seasonId = chooseSeasonId(picked, initialSeasonId, seasons.data);
  const episodes = useAsync<BaseItem[]>(
    () => (seasonId ? client.episodes(session.userId, seriesId, seasonId) : Promise.resolve([])),
    [client, session.userId, seriesId, seasonId],
  );
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
      {episodes.loading && !episodes.data ? <p class="hint">Loading...</p> : null}
      <ul class="ep-list">
        {(episodes.data || []).map((ep) => {
          const progress = progressFraction(ep.UserData, ep.RunTimeTicks);
          const from = resumeTicks(ep);
          const played = !!(ep.UserData && ep.UserData.Played);
          const current = ep.Id === currentEpisodeId;
          return (
            <li key={ep.Id} class={current ? 'ep current' : 'ep'}>
              <button type="button" class="ep-open" onClick={() => onOpen(ep.Id)}>
                <span class="ep-art">
                  <Img src={artUrl(client.serverUrl, ep, 'thumb', 320, 180)} />
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
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="ep-play"
                aria-label={tv.tv ? `Play ${ep.Name} on TV` : `Play ${ep.Name}`}
                onClick={async () => {
                  if (!tv.tv) playOnPhone(ep, from);
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
