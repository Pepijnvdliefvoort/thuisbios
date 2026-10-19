import qrcode from 'qrcode-generator';

/** The QR modules for `text` as a square matrix (true = dark). Error correction level M. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/** One SVG path made of horizontal runs of dark modules (compact: one rect per run, not per module). */
export function qrPath(matrix: boolean[][], quiet: number): string {
  let d = '';
  for (let r = 0; r < matrix.length; r++) {
    let c = 0;
    while (c < matrix[r].length) {
      if (!matrix[r][c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix[r].length && matrix[r][c]) c++;
      d += `M${start + quiet} ${r + quiet}h${c - start}v1h${start - c}z`;
    }
  }
  return d;
}

/** Side length in modules including the quiet zone. */
export const qrSize = (matrix: boolean[][], quiet: number): number => matrix.length + quiet * 2;
