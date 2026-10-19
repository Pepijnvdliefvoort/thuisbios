/**
 * Selection logic of the backdrop. `target` is the wanted image URL ('' means "no art": show the
 * generic background). An image only becomes `shown` when the one currently `loading` finishes, so
 * a slow older image can never replace a newer selection: events for any other URL are ignored.
 */
export interface BackdropState {
  /** Image currently on screen ('' = generic background). */
  shown: string;
  /** Image that was on screen before, kept underneath while the new one fades in or out. */
  prev: string;
  /** Image being loaded, not visible yet. */
  loading: string;
}

export type BackdropEvent =
  | { type: 'target'; src: string }
  | { type: 'loaded'; src: string }
  | { type: 'failed'; src: string };

export const initialBackdrop = (src: string): BackdropState => ({ shown: '', prev: '', loading: src });

export function backdropReducer(state: BackdropState, event: BackdropEvent): BackdropState {
  switch (event.type) {
    case 'target':
      if (event.src === '') {
        // No art for this item: fade out to the generic background.
        return state.shown === '' && state.loading === '' ? state : { shown: '', prev: state.shown || state.prev, loading: '' };
      }
      if (event.src === state.shown) return state.loading === '' ? state : { ...state, loading: '' };
      return event.src === state.loading ? state : { ...state, loading: event.src };
    case 'loaded':
      if (event.src !== state.loading) return state;
      return { shown: event.src, prev: state.shown || state.prev, loading: '' };
    case 'failed':
      if (event.src !== state.loading) return state;
      return { shown: '', prev: state.shown || state.prev, loading: '' };
  }
  return state;
}

/** Images to render (each once) with whether it is visible. The generic background is always underneath. */
export function backdropLayers(state: BackdropState): Array<{ src: string; on: boolean }> {
  const layers: Array<{ src: string; on: boolean }> = [];
  const add = (src: string, on: boolean): void => {
    if (src && !layers.some((l) => l.src === src)) layers.push({ src, on });
  };
  add(state.prev, state.shown !== '' && state.prev !== state.loading);
  add(state.shown, true);
  add(state.loading, false);
  return layers;
}
