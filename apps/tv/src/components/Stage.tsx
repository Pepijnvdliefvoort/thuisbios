import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { STAGE_H, STAGE_W, fitStage, type StageFit } from '../layout/stageFit';

const current = (): StageFit => fitStage(window.innerWidth, window.innerHeight);

/**
 * Hosts the px-based screens (laid out for 1920x1080) and scales them to fit the window, so the page
 * also works in a desktop browser. At exactly 1920x1080 (the TV) no transform or custom property is
 * applied, so the TV renders as it always did. Full-bleed backgrounds use `--bx` / `--by` (the
 * window's overshoot past the stage, in stage px) to reach the window edges.
 */
export function Stage({ children }: { children: ComponentChildren }) {
  const [fit, setFit] = useState(current);
  useEffect(() => {
    const update = () => {
      const next = current();
      setFit((old) =>
        old.exact === next.exact && old.scale === next.scale && old.x === next.x && old.y === next.y ? old : next,
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const style = fit.exact
    ? undefined
    : {
        width: STAGE_W + 'px',
        height: STAGE_H + 'px',
        transform: 'translate(' + fit.x + 'px, ' + fit.y + 'px) scale(' + fit.scale + ')',
        '--bx': fit.bleedX + 'px',
        '--by': fit.bleedY + 'px',
      };
  return (
    <div class="stage-root">
      <div class="stage" style={style}>
        {children}
      </div>
    </div>
  );
}
