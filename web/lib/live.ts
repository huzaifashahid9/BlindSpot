// Shared helpers for the near-real-time FIRMS feed (/api/live).

export type LiveFile = { updated: string; sources: Record<string, { n: number; error?: string }>; fires: [number, number, number, number, number, string][]; error?: string };

// --- geometry helpers
export function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inPoly(x: number, y: number, g: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
}
export function bbox(g: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const pts = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flatMap((p) => p[0]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
export const km = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return 6371 * Math.sqrt(x * x + y * y);
};

/** Fuse detections into events the same way as the pipeline (0.75 km), approximately: greedy grid clustering. */
export function fuse(fires: LiveFile["fires"]) {
  const cell = 0.01;
  const grid = new Map<string, number[]>();
  const ev: { lat: number; lon: number; sats: number; frp: number; n: number; last: number }[] = [];
  for (const [lat, lon, t, sat, frp] of fires) {
    const gx = Math.floor(lon / cell), gy = Math.floor(lat / cell);
    let hit = -1;
    for (let dx = -1; dx <= 1 && hit < 0; dx++)
      for (let dy = -1; dy <= 1 && hit < 0; dy++)
        for (const k of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (km(lat, lon, ev[k].lat, ev[k].lon) <= 0.75) { hit = k; break; }
    if (hit >= 0) {
      const e = ev[hit];
      e.sats |= 1 << sat;
      e.frp = Math.max(e.frp, frp);
      e.n++;
      e.last = Math.max(e.last, t);
    } else {
      ev.push({ lat, lon, sats: 1 << sat, frp, n: 1, last: t });
      const key = `${gx},${gy}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(ev.length - 1);
    }
  }
  return ev;
}

