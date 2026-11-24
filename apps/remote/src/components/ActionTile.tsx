import type { ComponentChildren } from 'preact';

/**
 * A tile of the phone quick-action row: a round icon button with a short label under it. `on` shows the toggled
 * state (in My list, watched); pass `pressed` to expose it as aria-pressed.
 */
export function ActionTile({
  label,
  ariaLabel,
  children,
  on = false,
  pressed,
  disabled,
  title,
  class: cls,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  children: ComponentChildren;
  on?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  class?: string;
  onClick: () => void;
}) {
  const classes = ['action-tile', on ? 'on' : '', cls || ''].filter(Boolean).join(' ');
  return (
    <button type="button" class={classes} aria-label={ariaLabel} aria-pressed={pressed} title={title} disabled={disabled} onClick={onClick}>
      <span class="tile-circle">{children}</span>
      <span class="tile-label">{label}</span>
    </button>
  );
}
