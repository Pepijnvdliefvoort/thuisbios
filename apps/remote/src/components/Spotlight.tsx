import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { formatRuntime } from '../jellyfin/format';
import { findPlayTarget, resumeTicks } from '../jellyfin/playTarget';
import type { BaseItem } from '../jellyfin/types';
import { Icon } from './Icon';
import { Img } from './Img';
import { Skeleton } from './Skeleton';

/** Time a slide stays before the next one fades in. */
const SLIDE_MS = 8000;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Desktop home hero: full-bleed backdrop of a recently added title with its details and Play / More info buttons.
 * Cycles through `items` on a timer (not while hovered, hidden or with reduced motion). `pending` reserves the height
 * while the lists load.
 */
export function Spotlight({ items, pending }: { items: BaseItem[]; pending: boolean }) {
  const { client, session, openItem, playHere, toast } = useApp();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [away, setAway] = useState(() => typeof document !== 'undefined' && document.hidden);
  const root = useRef<HTMLDivElement>(null);
  const looking = useRef(false);
  const count = items.length;

  useEffect(() => {
    const sync = () => setAway(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (count < 2 || hovered || away || reducedMotion()) return;
    const timer = setTimeout(() => {
      // The Home tab can be hidden behind another tab or screen: stay on this slide until it is visible again.
      if (root.current && root.current.offsetParent === null) return;
      setIndex((i) => (i + 1) % count);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, count, hovered, away]);

  if (count === 0) {
    return pending ? (
      <div class="spotlight loading" role="status" aria-label="Loading">
        <div class="sp-content">
          <Skeleton class="skel-eyebrow" />
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
          </div>
        </div>
      </div>
    ) : null;
  }
  const current = items[index % count];
  const isShow = current.Type === 'Series';
  const meta = [formatRuntime(current.RunTimeTicks), current.Genres ? current.Genres.slice(0, 2).join(', ') : ''].filter(Boolean);

  /** Starts playback here, like the play button on a card (a series plays its next episode). */
  const play = async () => {
    if (looking.current) return;
    looking.current = true;
    try {
      const target = await findPlayTarget(client, session.userId, current);
      if (target) playHere(target, resumeTicks(target));
      else toast('Nothing to play');
    } catch {
      toast('Nothing to play');
    } finally {
      looking.current = false;
    }
  };

  return (
    <div
      class="spotlight"
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Recently added"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {items.map((item, i) => (
        <div key={item.Id} class={i === index ? 'sp-slide on' : 'sp-slide'} aria-hidden={i === index ? undefined : 'true'}>
          <Img class="sp-img" src={artUrl(client.serverUrl, item, 'backdrop', 1920, 1080)} />
        </div>
      ))}
      <div class="sp-shade" />
      <div class="sp-content" key={current.Id}>
        <p class="sp-eyebrow">{isShow ? 'New series' : 'New movie'}</p>
        <h2 class="sp-title">{current.Name}</h2>
        <p class="sp-meta">
          {current.ProductionYear ? <span>{current.ProductionYear}</span> : null}
          {current.OfficialRating ? <span class="rating-badge">{current.OfficialRating}</span> : null}
          {current.CommunityRating ? <span>{`★ ${current.CommunityRating.toFixed(1)}`}</span> : null}
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </p>
        {current.Overview ? <p class="sp-overview">{current.Overview}</p> : null}
        <div class="sp-actions">
          <button type="button" class="sp-btn sp-play" onClick={() => void play()}>
            <Icon name="play" size={24} /> Play
          </button>
          <button type="button" class="sp-btn sp-info" onClick={() => openItem(current.Id)}>
            <Icon name="info" size={22} /> More info
          </button>
        </div>
      </div>
      {count > 1 ? (
        <div class="sp-dots">
          {items.map((item, i) => (
            <button
              key={item.Id}
              type="button"
              class={i === index ? 'sp-dot on' : 'sp-dot'}
              aria-label={`Show ${item.Name} (${i + 1} of ${count})`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
