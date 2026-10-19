const FOCUSABLE = '[data-focusable]';

/**
 * Lets the TV browser's mouse pointer drive the selection: hovering a `[data-focusable]` element
 * focuses it, so the red highlight follows the pointer. Clicks need no code here: the focusable
 * elements are buttons, and Enter and a pointer click both end up in the same `click` handler.
 * Returns a function that removes the listener.
 */
export function installPointerFocus(doc: Document = document): () => void {
  const listener = (event: Event) => {
    let node = event.target as Element | null;
    while (node && node.nodeType === 1) {
      if (node.matches(FOCUSABLE)) {
        const el = node as HTMLElement;
        if (doc.activeElement !== el) el.focus();
        return;
      }
      node = node.parentElement;
    }
  };
  // mouseover bubbles (mouseenter does not), so one delegated listener is enough.
  doc.addEventListener('mouseover', listener);
  return () => doc.removeEventListener('mouseover', listener);
}
