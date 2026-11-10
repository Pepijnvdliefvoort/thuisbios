import { useState } from 'preact/hooks';

/**
 * Lazy image on a dark placeholder. `src` may be a list of candidates: when one fails to load the next is tried.
 * Shows nothing (just the placeholder) when all fail or there is no src; `onExhausted` is then called once.
 */
export function Img({
  src,
  alt = '',
  class: cls = '',
  onExhausted,
}: {
  src: string | string[];
  alt?: string;
  class?: string;
  onExhausted?: () => void;
}) {
  const list = (Array.isArray(src) ? src : [src]).filter(Boolean);
  const key = list.join('\n');
  // Failures are remembered per list, so a new list starts again at its first image.
  const [state, setState] = useState({ key, failed: 0 });
  const failed = state.key === key ? state.failed : 0;
  const current = list[failed];
  const fail = () => {
    setState({ key, failed: failed + 1 });
    if (failed + 1 >= list.length && onExhausted) onExhausted();
  };
  return (
    <span class={`img ${cls}`}>
      {current ? <img key={current} src={current} alt={alt} draggable={false} loading="lazy" decoding="async" onError={fail} /> : null}
    </span>
  );
}

/**
 * Wide hero image: tries the backdrop candidates, then falls back to a blurred, enlarged copy of the poster
 * (`blurClass` styles that), and stays the dark placeholder only when the poster fails too.
 */
export function BackdropImg({
  backdrops,
  poster,
  class: cls = '',
  blurClass,
}: {
  backdrops: string[];
  poster: string;
  class?: string;
  blurClass: string;
}) {
  const key = backdrops.join('\n');
  const [lost, setLost] = useState('');
  const useBlur = backdrops.length === 0 || lost === key;
  return useBlur ? (
    <Img class={`${cls} ${blurClass}`} src={poster} />
  ) : (
    <Img class={cls} src={backdrops} onExhausted={() => setLost(key)} />
  );
}
