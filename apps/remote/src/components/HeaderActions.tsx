import { AccountButton } from './AccountButton';
import { TvButton } from './TvButton';

/** The TV button and the account avatar, side by side at the right of the phone header and the desktop top bar. */
export function HeaderActions({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div class="header-actions">
      <TvButton />
      <AccountButton onSignOut={onSignOut} />
    </div>
  );
}
