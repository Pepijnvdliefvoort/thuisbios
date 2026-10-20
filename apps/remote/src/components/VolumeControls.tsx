import { useEffect, useMemo, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import { useApp } from '../context';
import { buildAuthHeader } from '../jellyfin/auth';
import { createTvVolume, describeVolumeError, type VolumeKey } from '../tvVolume';
import { Icon, type IconName } from './Icon';

// The relay's status is checked once per sign-in and shared by every VolumeControls on screen.
const checks = new Map<string, Promise<boolean>>();

const BUTTONS: { key: VolumeKey; icon: IconName; label: string }[] = [
  { key: 'KEY_VOLDOWN', icon: 'volumeDown', label: 'Volume down' },
  { key: 'KEY_MUTE', icon: 'volumeMute', label: 'Mute' },
  { key: 'KEY_VOLUP', icon: 'volumeUp', label: 'Volume up' },
];

/** Volume down, mute and volume up for the TV, through the relay on the PC. Hidden when there is none. */
export function VolumeControls() {
  const { session, toast } = useApp();
  const volume = useMemo(
    () => createTvVolume({ baseUrl: location.href, authHeader: buildAuthHeader(clientInfo(), session.token) }),
    [session.token],
  );
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let check = checks.get(session.token);
    if (!check) {
      check = volume.isConfigured();
      checks.set(session.token, check);
    }
    void check.then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [volume, session.token]);

  if (!available) return null;
  return (
    <div class="volume" role="group" aria-label="TV volume">
      {BUTTONS.map((b) => (
        <button
          key={b.key}
          type="button"
          class="tbtn"
          aria-label={b.label}
          onClick={() => {
            void volume.press(b.key).then((r) => {
              if (!r.ok) toast(describeVolumeError(r.error));
            });
          }}
        >
          <Icon name={b.icon} size={30} />
        </button>
      ))}
    </div>
  );
}
