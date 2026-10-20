import { useState } from 'preact/hooks';

export const POSTER_W = 40;
export const POSTER_H = 60;

/** Small poster thumbnail on a placeholder; the placeholder stays when there is no poster or it fails to load. */
export function RequestPoster({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span class="req-poster">
      {url && !failed ? (
        <img src={url} alt="" width={POSTER_W} height={POSTER_H} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}
