// Coordinate space: all values are page-normalized percentages (0..100).
// Eraser radius is therefore also in % of page width — a constant feels
// consistent across zoom because the stored stroke is already normalized.

export function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  const ddx = px - nx;
  const ddy = py - ny;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

export function hitStroke(
  points: number[][],
  mx: number, my: number,
  radius: number,
): boolean {
  if (points.length === 0) return false;
  if (points.length === 1) {
    const dx = mx - points[0][0];
    const dy = my - points[0][1];
    return dx * dx + dy * dy < radius * radius;
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (pointToSegmentDist(mx, my, a[0], a[1], b[0], b[1]) < radius) return true;
  }
  return false;
}
