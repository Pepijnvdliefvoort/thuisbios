import { useEffect, useReducer } from 'preact/hooks';
import { backdropLayers, backdropReducer, initialBackdrop } from './backdropState';

interface Props {
  /** Image URL, or '' when the item has no backdrop art (shows the generic background). */
  src: string;
  width: number;
  height: number;
}

/**
 * Full-bleed backdrop. A generic dark gradient sits underneath; the image cross-fades over it once
 * loaded. With no art (or when the image fails) it fades back to the generic background instead of
 * keeping the previous image. Only opacity is animated.
 */
export function Backdrop({ src, width, height }: Props) {
  const [state, dispatch] = useReducer(backdropReducer, src, initialBackdrop);

  useEffect(() => {
    dispatch({ type: 'target', src });
  }, [src]);

  return (
    <div class="backdrop">
      {backdropLayers(state).map((layer) => (
        <img
          key={layer.src}
          class={layer.on ? 'backdrop-img on' : 'backdrop-img'}
          alt=""
          width={width}
          height={height}
          src={layer.src}
          onLoad={() => dispatch({ type: 'loaded', src: layer.src })}
          onError={() => dispatch({ type: 'failed', src: layer.src })}
        />
      ))}
    </div>
  );
}
