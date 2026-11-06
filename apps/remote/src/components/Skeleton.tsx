import type { CardShape } from './MediaCard';

/** A grey placeholder block with a moving highlight (styled on desktop only; these are rendered on desktop only). */
export function Skeleton({ class: cls = '' }: { class?: string }) {
  return <span class={`skel ${cls}`} aria-hidden="true" />;
}

/** One card: art in the card's shape and two caption lines. */
export function CardSkeleton({ shape }: { shape: CardShape }) {
  return (
    <div class={`skel-card skel-card-${shape}`}>
      <Skeleton class={`skel-art skel-${shape}`} />
      <Skeleton class="skel-line" />
      <Skeleton class="skel-line short" />
    </div>
  );
}

/** A titled row of placeholder cards, laid out like Row. */
export function RowSkeleton({ shape, count = 9 }: { shape: CardShape; count?: number }) {
  return (
    <section class="row row-skel" role="status" aria-label="Loading">
      <Skeleton class="skel-heading" />
      <div class="row-scroll">
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} shape={shape} />
        ))}
      </div>
    </section>
  );
}

/** A grid of placeholder cards, laid out like Grid. */
export function GridSkeleton({ shape = 'poster', count = 16 }: { shape?: CardShape; count?: number }) {
  return (
    <div class={shape === 'thumb' ? 'grid grid-thumb' : 'grid'} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} shape={shape} />
      ))}
    </div>
  );
}
