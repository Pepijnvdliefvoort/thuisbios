/**
 * Slow, calm gradient background: three large radial-gradient blobs drifting with transform and
 * opacity only (no blur filter, the falloff is in the gradient). Pure CSS, no JS per frame.
 */
export function CalmBackground() {
  return (
    <div class="calm" aria-hidden="true">
      <div class="calm-blob calm-a" />
      <div class="calm-blob calm-b" />
      <div class="calm-blob calm-c" />
    </div>
  );
}
