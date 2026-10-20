import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface AsyncState<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
  /** Runs `load` again (keeping the old data meanwhile); resolves when that run has finished. */
  reload(): Promise<void>;
}

/** A set of reload functions, so a parent can refresh data that its children load. */
export type Reloaders = { current: Set<() => Promise<void>> };

/** Registers `reload` in `group` while mounted. */
export function useRegisterReload(group: Reloaders | undefined, reload: () => Promise<void>): void {
  useEffect(() => {
    if (!group) return;
    group.current.add(reload);
    return () => {
      group.current.delete(reload);
    };
  }, [group, reload]);
}

/** Runs `load` when `deps` change or `reload()` is called; ignores results of superseded runs. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const waiters = useRef<Array<() => void>>([]);
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiters.current.push(resolve);
        setNonce((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ data: s.data, error: false, loading: true }));
    const settle = () => {
      if (cancelled) return;
      const done = waiters.current;
      waiters.current = [];
      done.forEach((resolve) => resolve());
    };
    load().then(
      (data) => {
        if (!cancelled) setState({ data, error: false, loading: false });
        settle();
      },
      () => {
        if (!cancelled) setState({ data: null, error: true, loading: false });
        settle();
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload };
}
