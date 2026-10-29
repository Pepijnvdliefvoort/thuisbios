import { matchesQuery, useMediaQuery } from './useMediaQuery';

/**
 * A wide window with a mouse. The desktop rules in styles.css use the same query; a phone never matches
 * it (its pointer is coarse), so the phone layout is untouched.
 */
export const DESKTOP_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)';

/** A mouse or trackpad drives the page (any window size): the player offers hover controls and shortcuts. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** The primary pointer is a finger: phones and tablets, whatever the window size. */
export const COARSE_QUERY = '(pointer: coarse)';

export const isDesktop = (): boolean => matchesQuery(DESKTOP_QUERY);

/** True while the window is a desktop one. Follows resizing across the breakpoint. */
export const useDesktop = (): boolean => useMediaQuery(DESKTOP_QUERY);

/** True while the main pointer is a mouse or trackpad. */
export const useFinePointer = (): boolean => useMediaQuery(FINE_POINTER_QUERY);
