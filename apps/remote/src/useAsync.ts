import { useEffect, useState } from 'preact/hooks';

export interface AsyncState<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
}

/** Runs `load` when `deps` change; ignores results of superseded runs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: false, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ data: s.data, error: false, loading: true }));
    load().then(
      (data) => !cancelled && setState({ data, error: false, loading: false }),
      () => !cancelled && setState({ data: null, error: true, loading: false }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
