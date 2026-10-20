/** The app shell's one scrolling element (the page behind the fixed tab bar). Sign-in style screens scroll the window instead. */
export const SCROLLER_ID = 'scroller';

export const getScroller = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.getElementById(SCROLLER_ID));

/** How far the page is scrolled, whichever element scrolls. */
export const scrollOffset = (): number => {
  const el = getScroller();
  return el ? el.scrollTop : window.scrollY;
};

export const scrollToOffset = (top: number): void => {
  const el = getScroller();
  if (el) el.scrollTop = top;
  else window.scrollTo(0, top);
};
