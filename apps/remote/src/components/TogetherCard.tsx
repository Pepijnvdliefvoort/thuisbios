import { Icon } from './Icon';
import type { GroupInfo } from '../syncplay/protocol';
import { primePlayerVideo } from '../playerVideo';
import { groupCardLabel } from '../syncplay/groups';

/** Compact card at the top of Home: open watch together groups, each with a Join button. */
export function TogetherCard({ groups, busy, onJoin }: { groups: GroupInfo[]; busy: boolean; onJoin: (group: GroupInfo) => void }) {
  if (groups.length === 0) return null;
  return (
    <section class="together-card" aria-label="Watch together">
      {groups.slice(0, 3).map((g) => (
        <div class="together-row" key={g.groupId}>
          <span class="together-icon" aria-hidden="true">
            <Icon name="group" size={22} />
          </span>
          <span class="together-text">{groupCardLabel(g)}</span>
          <button type="button" class="btn primary together-join" disabled={busy} onClick={() => {
              primePlayerVideo(); // inside the tap, before anything async (iOS)
              onJoin(g);
            }}>
            Join
          </button>
        </div>
      ))}
    </section>
  );
}
