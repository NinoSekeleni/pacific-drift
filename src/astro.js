// Sun, moon and star positions for any place and moment (after Vladimir Agafonkin's SunCalc).
const rad = Math.PI / 180;
const dayMs = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const obl = rad * 23.4397;

export const toDays = (ms) => ms / dayMs - 0.5 + J1970 - J2000;
const rightAsc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(obl) - Math.tan(b) * Math.sin(obl), Math.cos(l));
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(obl) + Math.cos(b) * Math.sin(obl) * Math.sin(l));
const azim = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const alti = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  return { dec: decl(L, 0), ra: rightAsc(L, 0) };
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: rightAsc(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Sun and moon altitude/azimuth (radians; azimuth from south, westward) and lunar illumination. */
export function skyBodies(ms, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const st = sidereal(d, lw);
  const Hs = st - s.ra;
  const Hm = st - m.ra;
  const sdist = 149598000;
  const ph = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(ph), m.dist - sdist * Math.cos(ph));
  return {
    sun: { az: azim(Hs, phi, s.dec), alt: alti(Hs, phi, s.dec) },
    moon: { az: azim(Hm, phi, m.dec), alt: alti(Hm, phi, m.dec) },
    illum: (1 + Math.cos(inc)) / 2
  };
}

/** Scene direction (x east, y up, z south) for an alt/az pair from skyBodies. */
export function bodyDir(body, out) {
  const bearing = body.az + Math.PI;
  const c = Math.cos(body.alt);
  out.x = Math.sin(bearing) * c;
  out.y = Math.sin(body.alt);
  out.z = -Math.cos(bearing) * c;
  return out;
}

/** Local sidereal time in radians. */
export function lst(ms, lng) {
  const d = toDays(ms);
  return rad * (((280.46061837 + 360.98564736629 * d + lng) % 360) + 360) % 360;
}

/**
 * Rotation (row-major 3x3) from equatorial unit vectors to scene axes
 * (x east, y up, z = -north) for an observer at lat/lng.
 */
export function equatorialToLocal(ms, lat, lng) {
  const th = lst(ms, lng);
  const phi = lat * rad;
  const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(phi), sp = Math.sin(phi);
  const E = [-st, ct, 0];
  const U = [cp * ct, cp * st, sp];
  const N = [-sp * ct, -sp * st, cp];
  return [E[0], E[1], E[2], U[0], U[1], U[2], -N[0], -N[1], -N[2]];
}

export function eqVector(raDeg, decDeg) {
  const a = raDeg * rad, d = decDeg * rad;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
