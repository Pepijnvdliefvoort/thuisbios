import { qrMatrix, qrPath, qrSize } from '../qr';

const QUIET = 3;

/** QR code as one inline SVG path: dark modules on a white quiet zone. */
export function QrCode({ text, size }: { text: string; size: number }) {
  const matrix = qrMatrix(text);
  const side = qrSize(matrix, QUIET);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      shape-rendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <rect width={side} height={side} fill="#fff" />
      <path d={qrPath(matrix, QUIET)} fill="#0b0b10" />
    </svg>
  );
}
