import { useEffect, useRef, useState } from 'preact/hooks';
import { decodeQrFromVideo, loadDecoder } from '../qr';

const SCAN_INTERVAL_MS = 200;

/** Full-screen camera viewfinder that reports the first QR code it reads. Only usable in a secure context. */
export function QrScanner({ onText, onCancel }: { onText: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const textRef = useRef(onText);
  textRef.current = onText;

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | undefined;
    const canvas = document.createElement('canvas');
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    void (async () => {
      try {
        const [decode, s] = await Promise.all([
          loadDecoder(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        ]);
        stream = s;
        if (stopped) return stop();
        const v = video.current;
        if (!v) return stop();
        v.srcObject = s;
        await v.play().catch(() => undefined);
        let last = 0;
        const tick = (now: number) => {
          if (stopped) return;
          raf = requestAnimationFrame(tick);
          if (now - last < SCAN_INTERVAL_MS) return;
          last = now;
          const text = decodeQrFromVideo(decode, v, canvas);
          if (text) {
            stop();
            textRef.current(text);
          }
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setError("Can't open the camera. Allow camera access and try again.");
      }
    })();
    return stop;
  }, []);

  return (
    <div class="scanner" role="dialog" aria-label="Scan the QR code on the TV">
      <video ref={video} class="scanner-video" playsInline muted autoPlay />
      <div class="scanner-frame" aria-hidden="true" />
      <div class="scanner-bar">
        <p class={error ? 'error' : 'scanner-hint'}>{error || "Point the camera at the TV's QR code."}</p>
        <button type="button" class="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
