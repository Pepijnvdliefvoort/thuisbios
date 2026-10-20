/** Simple inline SVG icons (24x24, currentColor). */
const Svg = (props: { children: preact.ComponentChildren; class?: string }) => (
  <svg class={props.class} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {props.children}
  </svg>
);

export const PlayIcon = () => (
  <Svg>
    <path d="M8 5v14l11-7z" />
  </Svg>
);
export const PauseIcon = () => (
  <Svg>
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </Svg>
);
export const BackIcon = () => (
  <Svg>
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
  </Svg>
);
const ARROW = 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z';
export const Replay10Icon = () => (
  <Svg>
    <path d={ARROW} />
    <text x="12" y="17" text-anchor="middle" font-size="7.5" font-weight="700" font-family="sans-serif">
      10
    </text>
  </Svg>
);
export const Forward10Icon = () => (
  <Svg>
    <path d={ARROW} transform="translate(24 0) scale(-1 1)" />
    <text x="12" y="17" text-anchor="middle" font-size="7.5" font-weight="700" font-family="sans-serif">
      10
    </text>
  </Svg>
);
export const CaptionsIcon = () => (
  <Svg>
    <path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z" />
  </Svg>
);
export const ChevronLeftIcon = () => (
  <Svg>
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </Svg>
);
export const ChevronRightIcon = () => (
  <Svg>
    <path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z" />
  </Svg>
);
export const SpinnerIcon = () => (
  <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
    <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4" />
    <path d="M25 5a20 20 0 0 1 20 20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
  </svg>
);
