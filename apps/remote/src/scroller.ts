/** The app shell's one scrolling element (the page behind the fixed tab bar). Sign-in has its own scroll box; the window never scrolls, so the offset falls back to 0. */
export const SCROLLER_ID = 'scroller';

export const getScroller = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.getElementById(SCROLLER_ID));

/** How far the page is scrolled, whichever element scrolls. */
export const scrollOffset = (): number => {
  const el = getScroller();
  return el ? el.scrollTop : 0;
};

export const scrollToOffset = (top: number): void => {
  const el = getScroller();
  if (el) el.scrollTop = top;
};
