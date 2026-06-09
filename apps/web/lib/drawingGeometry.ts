// Coordinate space: all values are page-normalized percentages (0..100).
// Eraser radius is therefore also in % of page width — a constant feels
// consistent across zoom because the stored stroke is already normalized.

// Perpendicular distance from point p to the infinite line through a and b.
// Uses the cross-product formula — only the (x, y) components of each point
// are used; the optional pressure value at index [2] is ignored.
function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(lenSq);
}

// Ramer-Douglas-Peucker polyline simplification.
// epsilon is in the same units as the point coordinates (page %).
// Points are [[x, y, pressure?], ...]; pressure is preserved on surviving points.
export function rdpSimplify(points: number[][], epsilon: number): number[][] {
  if (points.length <= 2) return points;

  const end = points.length - 1;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

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
