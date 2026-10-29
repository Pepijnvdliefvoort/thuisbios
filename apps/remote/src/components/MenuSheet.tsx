import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useDesktop } from '../useDesktop';
import { Icon, type IconName } from './Icon';

/**
 * A bottom sheet on the phone and a dropdown under the top bar on a desktop. Esc and a tap on the backdrop
 * close it, except while the volume sheet on top of it is open (that one is closed first).
 */
export function MenuSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ComponentChildren }) {
  const desktop = useDesktop();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.volume-backdrop')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class={desktop ? 'sheet-backdrop menu' : 'sheet-backdrop'} onClick={onClose}>
      <div class={desktop ? 'sheet menu' : 'sheet'} role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
        {desktop ? null : (
          <button type="button" class="btn ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

/** Round avatar with the user's initial, or a TV icon. */
export function Avatar({ letter, icon, size }: { letter?: string; icon?: IconName; size: number }) {
  return (
    <span class="avatar" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }}>
      {icon ? <Icon name={icon} size={Math.round(size * 0.5)} /> : letter}
    </span>
  );
}

/** A destructive button that swaps for Cancel / confirm buttons once tapped. */
export function ConfirmButton({ label, icon, onConfirm }: { label: string; icon: IconName; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" class="btn danger" onClick={() => setAsking(true)}>
        <Icon name={icon} size={20} /> {label}
      </button>
    );
  }
  return (
    <div class="confirm-row">
      <button type="button" class="btn secondary" onClick={() => setAsking(false)}>
        Cancel
      </button>
      <button type="button" class="btn danger solid" onClick={onConfirm}>
        {label}
      </button>
    </div>
  );
}
