import type jsQR from 'jsqr';

type Decoder = typeof jsQR;

const MAX_SIDE = 1280;

const decodeData = (decode: Decoder, d: ImageData): string | null =>
  decode(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;

/** Loads jsQR on first use so the main bundle stays small. */
export async function loadDecoder(): Promise<Decoder> {
  return (await import('jsqr')).default;
}

/** Text of the QR code in a photo, or null. Tries a downscaled copy first, then the full-size image. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const [decode, bitmap] = await Promise.all([loadDecoder(), createImageBitmap(file)]);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const longest = Math.max(bitmap.width, bitmap.height);
    const scales = longest > MAX_SIDE ? [MAX_SIDE / longest, 1] : [1];
    for (const scale of scales) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const text = decodeData(decode, ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (text) return text;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Text of the QR code in a video frame, or null. */
export function decodeQrFromVideo(decode: Decoder, video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeData(decode, ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/** Live scanning needs getUserMedia, which browsers only offer on HTTPS (or localhost). */
export const canScanLive = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
