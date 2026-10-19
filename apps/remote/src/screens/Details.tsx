import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Img } from '../components/Img';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel, formatRuntime, formatTicksClock, progressFraction } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';
import { useAsync } from '../useAsync';

/** Ticks to resume from: the saved position, ignored when it is basically the start. */
export const resumeTicks = (item: BaseItem): number => {
  const t = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
  return t > 100_000_000 ? t : 0; // under 10 s counts as "not started"
};

export function Details({ id, onBack }: { id: string; onBack: () => void }) {
  const { client, session } = useApp();
  const item = useAsync(() => client.item(session.userId, id), [client, session.userId, id]);
  return (
    <div class="details">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      {item.data ? <DetailsBody item={item.data} /> : null}
      {item.loading && !item.data ? <p class="hint pad-top">Loading...</p> : null}
      {item.error ? <p class="empty pad-top">Couldn't load this item.</p> : null}
    </div>
  );
}

function DetailsBody({ item }: { item: BaseItem }) {
  const { client, session, tv, toast, openItem } = useApp();
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

  const playItem = target.data;
  const resume = playItem ? resumeTicks(playItem) : 0;
  const noTv = !tv.tv;
  const disabled = noTv || !playItem;

  const send = async (action: Promise<boolean>) => {
    if (await action) toast('Sent to TV');
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
          {isEpisode && item.SeriesName ? <p class="eyebrow">{item.SeriesName}</p> : null}
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
            <button type="button" class="btn primary" disabled={disabled} onClick={() => void send(tv.play(playItem, resume))}>
              <Icon name="play" /> Resume on TV ({formatTicksClock(resume)})
            </button>
            <button type="button" class="btn secondary" disabled={disabled} onClick={() => void send(tv.play(playItem, 0))}>
              <Icon name="restart" size={20} /> Play from start
            </button>
          </>
        ) : (
          <button type="button" class="btn primary" disabled={disabled} onClick={() => playItem && void send(tv.play(playItem, 0))}>
            <Icon name="play" /> {isSeries ? 'Play next episode on TV' : 'Play on TV'}
          </button>
        )}
        <button type="button" class="btn secondary" disabled={noTv} onClick={() => void send(tv.show(item))}>
          <Icon name="eye" size={20} /> Show on TV
        </button>
        {noTv ? <p class="hint small">Open Thuisbios on your TV and sign in to use these buttons.</p> : null}
      </div>

      {item.Overview ? <p class="overview">{item.Overview}</p> : null}
      {item.Genres && item.Genres.length > 0 ? <p class="genres">{item.Genres.join(' · ')}</p> : null}

      {isSeries ? <Episodes series={item} onOpen={openItem} /> : null}
    </>
  );
}

function Episodes({ series, onOpen }: { series: BaseItem; onOpen: (id: string) => void }) {
  const { client, session, tv, toast } = useApp();
  const seasons = useAsync(() => client.seasons(session.userId, series.Id), [client, session.userId, series.Id]);
  const [picked, setPicked] = useState<string | null>(null);
  const seasonId = picked || (seasons.data && seasons.data[0] ? seasons.data[0].Id : null);
  const episodes = useAsync<BaseItem[]>(
    () => (seasonId ? client.episodes(session.userId, series.Id, seasonId) : Promise.resolve([])),
    [client, session.userId, series.Id, seasonId],
  );
  return (
    <section class="episodes">
      <h2>Episodes</h2>
      {seasons.data && seasons.data.length > 1 ? (
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
          return (
            <li key={ep.Id} class="ep">
              <button type="button" class="ep-open" onClick={() => onOpen(ep.Id)}>
                <span class="ep-art">
                  <Img src={artUrl(client.serverUrl, ep, 'thumb', 320, 180)} />
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
                  <span class="ep-sub">{formatRuntime(ep.RunTimeTicks)}</span>
                </span>
              </button>
              <button
                type="button"
                class="ep-play"
                disabled={!tv.tv}
                aria-label={`Play ${ep.Name} on TV`}
                onClick={async () => {
                  if (await tv.play(ep, from)) toast('Sent to TV');
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
