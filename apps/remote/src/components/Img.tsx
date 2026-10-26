import { useState } from 'preact/hooks';

/** Lazy image on a dark placeholder; shows nothing (just the placeholder) when it fails or has no src. */
export function Img({ src, alt = '', class: cls = '' }: { src: string; alt?: string; class?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span class={`img ${cls}`}>
      {src && !failed ? <img src={src} alt={alt} draggable={false} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : null}
    </span>
  );
}
