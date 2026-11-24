import { Icon } from './Icon';
import { MenuSheet } from './MenuSheet';

/** Who is watching together, and the way out: leaving keeps the video playing, on this device only. */
export function TogetherSheet({ name, participants, onLeave, onClose }: { name: string; participants: string[]; onLeave: () => void; onClose: () => void }) {
  return (
    <MenuSheet label="Watch together" onClose={onClose}>
      <div class="sheet-head">
        <div class="sheet-head-text">
          <strong>{name || 'Watch together'}</strong>
          <span>{participants.length === 1 ? '1 watching' : `${participants.length} watching`}</span>
        </div>
      </div>
      <ul class="together-sheet-list">
        {participants.map((p, i) => (
          <li key={`${i}:${p}`}>{p}</li>
        ))}
      </ul>
      <p class="sheet-note">Play, pause and skipping apply to everyone in the group.</p>
      <button type="button" class="btn danger" onClick={onLeave}>
        <Icon name="signout" size={20} /> Leave watch together
      </button>
    </MenuSheet>
  );
}
