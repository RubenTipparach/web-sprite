/** Bresenham line: returns array of [x, y] pixel coordinates. */
export function bresenhamLine(
  x0: number, y0: number,
  x1: number, y1: number,
): [number, number][] {
  const points: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  let cx = x0, cy = y0;
  for (;;) {
    points.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
  return points;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x, y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Midpoint ellipse algorithm: returns outline pixel coordinates. */
export function ellipsePixels(cx: number, cy: number, rx: number, ry: number): [number, number][] {
  const pts: [number, number][] = [];
  if (rx <= 0 && ry <= 0) { pts.push([cx, cy]); return pts; }
  if (rx <= 0) {
    for (let y = cy - ry; y <= cy + ry; y++) pts.push([cx, y]);
    return pts;
  }
  if (ry <= 0) {
    for (let x = cx - rx; x <= cx + rx; x++) pts.push([x, cy]);
    return pts;
  }

  let x = 0, y = ry;
  const rx2 = rx * rx, ry2 = ry * ry;
  const twoRx2 = 2 * rx2, twoRy2 = 2 * ry2;
  let px = 0, py = twoRx2 * y;

  const plot4 = (px: number, py: number) => {
    pts.push([cx + px, cy + py], [cx - px, cy + py],
             [cx + px, cy - py], [cx - px, cy - py]);
  };

  // Region 1
  let d1 = ry2 - rx2 * ry + 0.25 * rx2;
  plot4(x, y);
  while (px < py) {
    x++;
    px += twoRy2;
    if (d1 < 0) {
      d1 += ry2 + px;
    } else {
      y--;
      py -= twoRx2;
      d1 += ry2 + px - py;
    }
    plot4(x, y);
  }

  // Region 2
  let d2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y > 0) {
    y--;
    py -= twoRx2;
    if (d2 > 0) {
      d2 += rx2 - py;
    } else {
      x++;
      px += twoRy2;
      d2 += rx2 - py + px;
    }
    plot4(x, y);
  }

  return pts;
}

/** Midpoint circle algorithm: returns outline pixel coordinates. */
export function circlePixels(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  if (r <= 0) { pts.push([cx, cy]); return pts; }
  let x = r, y = 0, d = 1 - r;
  const add8 = (px: number, py: number) => {
    pts.push([cx + px, cy + py], [cx - px, cy + py],
             [cx + px, cy - py], [cx - px, cy - py],
             [cx + py, cy + px], [cx - py, cy + px],
             [cx + py, cy - px], [cx - py, cy - px]);
  };
  while (x >= y) {
    add8(x, y);
    y++;
    if (d <= 0) { d += 2 * y + 1; }
    else { x--; d += 2 * (y - x) + 1; }
  }
  return pts;
}

/** Rectangle outline pixels. */
export function rectPixels(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  for (let x = minX; x <= maxX; x++) { pts.push([x, minY]); pts.push([x, maxY]); }
  for (let y = minY + 1; y < maxY; y++) { pts.push([minX, y]); pts.push([maxX, y]); }
  return pts;
}

/** Flood fill: returns all pixel coordinates that should be filled. */
export function floodFill(
  data: Uint8ClampedArray, width: number, height: number,
  startX: number, startY: number,
  targetR: number, targetG: number, targetB: number, targetA: number,
): [number, number][] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return [];
  const off = (startY * width + startX) * 4;
  const sr = data[off], sg = data[off + 1], sb = data[off + 2], sa = data[off + 3];
  // Don't fill if target color matches source color
  if (sr === targetR && sg === targetG && sb === targetB && sa === targetA) return [];

  const filled: [number, number][] = [];
  const visited = new Uint8Array(width * height);
  const stack: [number, number][] = [[startX, startY]];
  visited[startY * width + startX] = 1;

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    const i = (cy * width + cx) * 4;
    if (data[i] !== sr || data[i + 1] !== sg || data[i + 2] !== sb || data[i + 3] !== sa) continue;
    filled.push([cx, cy]);

    const neighbors: [number, number][] = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      stack.push([nx, ny]);
    }
  }
  return filled;
}
