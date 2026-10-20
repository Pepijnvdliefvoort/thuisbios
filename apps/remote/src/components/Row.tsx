import type { ComponentChildren } from 'preact';
import type { BaseItem } from '../jellyfin/types';
import { MediaCard, type CardShape } from './MediaCard';

/** Titled horizontal scroll row; renders nothing when empty. */
export function Row({ title, items, shape }: { title: string; items: BaseItem[]; shape: CardShape }) {
  if (items.length === 0) return null;
  return (
    <section class="row">
      <h2>{title}</h2>
      <div class="row-scroll">
        {items.map((item) => (
          <MediaCard key={item.Id} item={item} shape={shape} />
        ))}
      </div>
    </section>
  );
}

export function Grid({ children }: { children: ComponentChildren }) {
  return <div class="grid">{children}</div>;
}
