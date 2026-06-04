// Shared data for the Somerton Man "Code Explorer" maps.
// Each code letter resolves to a railway station/locality on the 1948
// Adelaide network. 'L' in the codes means Largs Bay (key 'Lg').

export interface StationNode {
  n: string;
  lat: number;
  lon: number;
}

export const NODES: Record<string, StationNode> = {
  A: { n: 'Adelaide', lat: -34.9227, lon: 138.5983 },
  M: { n: 'Mile End', lat: -34.925, lon: 138.5801 },
  R: { n: 'Richmond', lat: -34.94, lon: 138.56 },
  G: { n: 'Glenelg', lat: -34.98055, lon: 138.51393 },
  O: { n: 'Oaklands Park', lat: -35.0099, lon: 138.5402 },
  B: { n: 'Brighton', lat: -35.048, lon: 138.508 },
  D: { n: 'Darlington', lat: -35.03, lon: 138.557 },
  Lg: { n: 'Largs Bay', lat: -34.825, lon: 138.49 },
  I: { n: 'Islington', lat: -34.868, lon: 138.59 },
  T: { n: 'Thebarton / Torrensville', lat: -34.9, lon: 138.567 },
  P: { n: 'Commercial Road, Port Adelaide', lat: -34.845, lon: 138.505 },
  N: { n: 'Northfield', lat: -34.83953, lon: 138.62325 },
  E: { n: 'Enfield', lat: -34.861, lon: 138.597 },
  S: { n: 'Seaton / Seaton Park', lat: -34.8921, lon: 138.51362 },
  Q: { n: 'Queenstown', lat: -34.862315, lon: 138.509005 },
  C: { n: 'Cheltenham', lat: -34.86986, lon: 138.52856 },
};

// Resolve a single code letter to its station node.
export function resolveNode(ch: string): StationNode | undefined {
  return NODES[ch] || NODES[ch === 'L' ? 'Lg' : ch];
}

// Turn a code string into an array of [lat, lon] points.
export function routePoints(code: string): [number, number][] {
  return code
    .split('')
    .map((ch) => resolveNode(ch))
    .filter((n): n is StationNode => Boolean(n))
    .map((n) => [n.lat, n.lon]);
}

// Great-circle distance in km between two nodes.
export function haversineKm(a: StationNode, b: StationNode): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

export interface RouteDef {
  key: string;
  name: string;
  code: string;
  color: string;
  crossed: boolean;
}

export const ROUTES: RouteDef[] = [
  { key: 'L1', name: 'Line 1', code: 'MRGOABABD', color: '#2563eb', crossed: false },
  { key: 'L2', name: 'Line 2', code: 'MLIAOI', color: '#f97316', crossed: true },
  { key: 'L3', name: 'Line 3', code: 'MTBIMPANETP', color: '#22c55e', crossed: false },
  { key: 'L4', name: 'Line 4', code: 'MLIABOAIAQC', color: '#a855f7', crossed: false },
  { key: 'L5', name: 'Line 5', code: 'ITTMTSAMSTGAB', color: '#ef4444', crossed: false },
];
