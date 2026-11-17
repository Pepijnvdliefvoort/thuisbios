import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../context';
import { castOf, crewOf, hasPeople, initials, personImageUrl } from '../jellyfin/people';
import type { BaseItem } from '../jellyfin/types';
import { useDesktop } from '../useDesktop';
import { Icon } from './Icon';
import { Img } from './Img';

/** Share of the visible width a row scrolls per arrow click. */
const PAGE = 0.9;

/** Round photo, or the person's initials when there is no photo (or it fails to load). `size` is the CSS size in px. */
export function PersonPhoto({ id, name, tag, size, class: cls = '' }: { id: string; name: string; tag?: string; size: number; class?: string }) {
  const { client } = useApp();
  const [failed, setFailed] = useState(false);
  // 2x of the CSS size, so it is sharp on a dense screen.
  const url = failed ? '' : personImageUrl(client.serverUrl, { Id: id, PrimaryImageTag: tag }, size * 2, size * 2);
  return (
    <span class={`person-photo ${cls}`} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.34)}px` }}>
      <span class="person-initials" aria-hidden="true">
        {initials(name)}
      </span>
      {url ? <Img class="person-img" src={url} onExhausted={() => setFailed(true)} /> : null}
    </span>
  );
}

/**
 * "Cast & crew" on the details page: a row of the actors (photo, name, character) and a line with the director(s)
 * and writer(s). Tapping a person opens their screen. Renders nothing without people or while offline.
 */
export function CastSection({ item }: { item: BaseItem }) {
  const { offline, openPerson } = useApp();
  const desktop = useDesktop();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const cast = castOf(item);
  const crew = crewOf(item);
  const sync = () => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft < 4;
    const end = el.scrollLeft + el.clientWidth > el.scrollWidth - 4;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  // Arrows only exist on a desktop.
  useEffect(() => {
    if (!desktop) return;
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [desktop, cast.length]);
  const page = (direction: number) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * PAGE, behavior: 'smooth' });
  };
  if (offline || !hasPeople(item)) return null;
  const size = desktop ? 104 : 84;
  const row = (
    <div class="row-scroll cast-scroll" ref={scroller} onScroll={desktop ? sync : undefined}>
      {cast.map((p) => (
        <button key={p.Id} type="button" class="cast-card" onClick={() => openPerson(p.Id, p.Name)}>
          <PersonPhoto id={p.Id} name={p.Name} tag={p.PrimaryImageTag} size={size} />
          <span class="cast-name">{p.Name}</span>
          {p.Role ? <span class="cast-role">{p.Role}</span> : null}
        </button>
      ))}
    </div>
  );
  return (
    <section class="cast">
      <h2>Cast &amp; crew</h2>
      {cast.length > 0 ? (
        desktop ? (
          <div class="row-wrap cast-wrap">
            {row}
            {edges.start ? null : (
              <button type="button" class="row-arrow prev" onClick={() => page(-1)} aria-label="Scroll cast back">
                <Icon name="back" size={32} />
              </button>
            )}
            {edges.end ? null : (
              <button type="button" class="row-arrow next" onClick={() => page(1)} aria-label="Scroll cast forward">
                <Icon name="back" size={32} />
              </button>
            )}
          </div>
        ) : (
          row
        )
      ) : null}
      {crew.length > 0 ? (
        <p class="crew">
          {crew.map((g, i) => (
            <span key={g.label} class="crew-group">
              {i > 0 ? <span class="crew-sep" aria-hidden="true"> · </span> : null}
              <span class="crew-label">{g.label}: </span>
              {g.people.map((p, j) => (
                <span key={p.Id}>
                  {j > 0 ? ', ' : ''}
                  <button type="button" class="crew-link" onClick={() => openPerson(p.Id, p.Name)}>
                    {p.Name}
                  </button>
                </span>
              ))}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
