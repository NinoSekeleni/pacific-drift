// Real coastlines (Natural Earth) with a coarse spatial index, plus local projection helpers.
export const R_EARTH = 6371000;
const DEG = Math.PI / 180;
const CELL = 2; // degrees

export const wrapLng = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Metres east/north of an origin, for short distances. Returns scene x (east) and z (south). */
export function toLocal(lat, lng, lat0, lng0, out = {}) {
  out.x = wrapLng(lng - lng0) * DEG * R_EARTH * Math.cos(lat0 * DEG);
  out.z = -(lat - lat0) * DEG * R_EARTH;
  return out;
}

/** Great-circle distance in metres. */
export function distance(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dp = p2 - p1, dl = wrapLng(lng2 - lng1) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2, degrees clockwise from north. */
export function bearing(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = wrapLng(lng2 - lng1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

export class Land {
  constructor(data) {
    this.polys = data.polys.map((p, i) => {
      const n = p.c.length / 2;
      const pts = new Float64Array(p.c.length);
      let x = 0, y = 0;
      for (let k = 0; k < n; k++) {
        x += p.c[k * 2];
        y += p.c[k * 2 + 1];
        pts[k * 2] = x / 1e4;
        pts[k * 2 + 1] = y / 1e4;
      }
      return { id: i, name: p.n, height: p.h, kind: p.k, bbox: p.b, pts, shift: p.b[2] > 180 };
    });
    this.grid = new Map();
    for (const p of this.polys) {
      const [x0, y0, x1, y1] = p.bbox;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const wcx = Math.floor((((((cx * CELL + 1) + 180) % 360) + 360) % 360 - 180) / CELL);
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = wcx + ',' + cy;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(p);
        }
      }
    }
  }

  static inRing(pts, x, y) {
    let c = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /** The landmass at a point, or null when it is open water. */
  landAt(lat, lng) {
    const list = this.grid.get(Math.floor(lng / CELL) + ',' + Math.floor(lat / CELL));
    if (!list) return null;
    for (const p of list) {
      const x = p.shift && lng < 0 ? lng + 360 : lng;
      const [x0, y0, x1, y1] = p.bbox;
      if (x < x0 || x > x1 || lat < y0 || lat > y1) continue;
      if (Land.inRing(p.pts, x, lat)) return p;
    }
    return null;
  }

  /** Landmasses whose bounding box comes within radius (m) of a point. */
  near(lat, lng, radius) {
    const dLat = radius / (DEG * R_EARTH);
    const dLng = dLat / Math.max(0.05, Math.cos(lat * DEG));
    const seen = new Set();
    const out = [];
    for (let cx = Math.floor((lng - dLng) / CELL); cx <= Math.floor((lng + dLng) / CELL); cx++) {
      for (let cy = Math.floor((lat - dLat) / CELL); cy <= Math.floor((lat + dLat) / CELL); cy++) {
        const wx = ((((cx * CELL + 180) % 360) + 360) % 360) - 180;
        const list = this.grid.get(Math.floor(wx / CELL) + ',' + cy);
        if (!list) continue;
        for (const p of list) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          const [x0, y0, x1, y1] = p.bbox;
          const lx = p.shift && lng < 0 ? lng + 360 : lng;
          const cxl = Math.max(x0, Math.min(x1, lx));
          const cyl = Math.max(y0, Math.min(y1, lat));
          if (distance(lat, lng, cyl, cxl) <= radius) out.push(p);
        }
      }
    }
    return out;
  }

  /** Distance (m) and bearing to the nearest coastline vertex among nearby landmasses. */
  nearestCoast(lat, lng, radius) {
    let best = { d: Infinity, poly: null, lat: 0, lng: 0 };
    for (const p of this.near(lat, lng, radius)) {
      const n = p.pts.length / 2;
      for (let k = 0; k < n; k++) {
        const plng = p.pts[k * 2], plat = p.pts[k * 2 + 1];
        if (Math.abs(plat - lat) * 111000 > Math.min(best.d, radius)) continue;
        const d = distance(lat, lng, plat, plng);
        if (d < best.d) best = { d, poly: p, lat: plat, lng: plng };
      }
    }
    return best;
  }
}
