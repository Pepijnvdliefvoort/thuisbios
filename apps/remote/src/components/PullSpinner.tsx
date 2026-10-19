import type { PullState } from '../usePullToRefresh';

/** Small circular spinner that slides down from the top while pulling or refreshing. */
export function PullSpinner({ pull }: { pull: PullState }) {
  const { offset, refreshing, dragging } = pull;
  if (offset <= 0 && !refreshing) return null;
  return (
    <div
      class={dragging ? 'ptr dragging' : 'ptr'}
      style={{ transform: `translateY(${offset - 60}px)`, opacity: Math.min(1, offset / 40) }}
      aria-hidden="true"
    >
      <span class={refreshing ? 'ptr-ring spinning' : 'ptr-ring'} style={refreshing ? undefined : { transform: `rotate(${offset * 4}deg)` }} />
    </div>
  );
}
