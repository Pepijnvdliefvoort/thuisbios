import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  src: string;
  width: number;
  height: number;
}

/**
 * Full-bleed backdrop image that cross-fades when `src` changes: the previous image stays under
 * the new one until the new one has loaded, so fast browsing never flashes an empty background.
 * Only opacity is animated.
 */
export function Backdrop({ src, width, height }: Props) {
  const [prev, setPrev] = useState('');
  const [cur, setCur] = useState(src);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = ready;

  useEffect(() => {
    if (src === cur) return;
    // Keep the old image under the new one only if it finished loading.
    setPrev(readyRef.current ? cur : prev);
    setCur(src);
    setReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div class="backdrop">
      {prev && <img class="backdrop-img on" alt="" width={width} height={height} src={prev} />}
      {cur && (
        <img
          key={cur}
          class={ready ? 'backdrop-img on' : 'backdrop-img'}
          alt=""
          width={width}
          height={height}
          src={cur}
          onLoad={() => setReady(true)}
          onError={() => setReady(false)}
        />
      )}
    </div>
  );
}
