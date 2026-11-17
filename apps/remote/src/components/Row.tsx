import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { BaseItem } from '../jellyfin/types';
import { useDesktop } from '../useDesktop';
import { Icon } from './Icon';
import { MediaCard, type CardShape } from './MediaCard';

/** Share of the visible width a row scrolls per arrow click. */
const PAGE = 0.9;

/** Titled horizontal scroll row; renders nothing when empty. On a desktop it gets arrow buttons. */
export function Row({
  title,
  items,
  shape,
  heading,
  currentId,
  showWatched,
}: {
  title: string;
  items: BaseItem[];
  shape: CardShape;
  /** Replaces the plain title in the heading (a link, say); `title` still names the scroll buttons. */
  heading?: ComponentChildren;
  /** The card of this item is marked as the one being viewed. */
  currentId?: string;
  showWatched?: boolean;
}) {
  const desktop = useDesktop();
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const sync = () => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft < 4;
    const end = el.scrollLeft + el.clientWidth > el.scrollWidth - 4;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  // Arrows only exist on a desktop; a phone row does no work on scroll.
  useEffect(() => {
    if (!desktop) return;
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [desktop, items.length]);
  const page = (direction: number) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * PAGE, behavior: 'smooth' });
  };
  if (items.length === 0) return null;
  const cards = items.map((item) => <MediaCard key={item.Id} item={item} shape={shape} current={item.Id === currentId} showWatched={showWatched} />);
  return (
    <section class="row">
      <h2>{heading || title}</h2>
      {desktop ? (
        <div class={'row-wrap row-' + shape}>
          <div class="row-scroll" ref={scroller} onScroll={sync}>
            {cards}
          </div>
          {edges.start ? null : (
            <button type="button" class="row-arrow prev" onClick={() => page(-1)} aria-label={`Scroll ${title} back`}>
              <Icon name="back" size={32} />
            </button>
          )}
          {edges.end ? null : (
            <button type="button" class="row-arrow next" onClick={() => page(1)} aria-label={`Scroll ${title} forward`}>
              <Icon name="back" size={32} />
            </button>
          )}
        </div>
      ) : (
        <div class="row-scroll">{cards}</div>
      )}
    </section>
  );
}

export function Grid({ children }: { children: ComponentChildren }) {
  return <div class="grid">{children}</div>;
}
