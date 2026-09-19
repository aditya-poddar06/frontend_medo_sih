/**
 * Deterministic mock heatmap data for India airfare pressure.
 *
 * Generates a flat-top hex grid over India, filters to land via a simplified
 * India boundary polygon (~30 vertices), and assigns fare-pressure values
 * using inverse-distance-weighted interpolation from known airports.
 */
import type { HeatmapCell, HeatmapResponse, HeatmapMetric, TimeRange } from '../types';
import { fixtureAirports, fixtureRoutes } from './explore';

/* ── Simplified India land boundary (lon, lat pairs) ── */
const INDIA_BOUNDARY: [number, number][] = [
  [68.7, 23.5], [70.0, 20.5], [72.0, 18.5], [72.9, 15.5],
  [74.5, 12.0], [75.0, 11.0], [77.0, 8.2],  [77.5, 8.0],
  [78.5, 9.5],  [79.5, 10.5], [80.2, 13.0], [80.3, 15.5],
  [82.0, 16.5], [83.5, 17.5], [85.0, 18.5], [86.5, 20.0],
  [87.5, 21.5], [88.5, 22.0], [89.0, 22.5], [88.5, 26.0],
  [89.5, 26.5], [92.0, 26.0], [93.0, 24.5], [94.0, 24.0],
  [94.5, 26.0], [96.5, 28.5], [97.0, 28.0], [96.0, 27.0],
  [93.5, 27.0], [90.5, 28.0], [88.0, 27.5], [85.0, 28.5],
  [81.5, 30.0], [79.0, 30.5], [77.5, 31.5], [76.5, 32.5],
  [75.0, 34.5], [74.5, 35.5], [73.5, 34.5], [72.5, 32.0],
  [71.0, 28.5], [69.5, 25.0], [68.7, 23.5],
];

/** Ray-casting point-in-polygon test. */
function pointInIndia(lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = INDIA_BOUNDARY.length - 1; i < INDIA_BOUNDARY.length; j = i++) {
    const [xi, yi] = INDIA_BOUNDARY[i];
    const [xj, yj] = INDIA_BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/* ── Hex grid generation (flat-top) ── */
const HEX_SPACING_DEG = 1.5; // ~165 km between cell centers
const HEX_RADIUS_DEG = HEX_SPACING_DEG * 0.58; // visual radius in degrees
const GRID_LAT_MIN = 7.0;
const GRID_LAT_MAX = 36.0;
const GRID_LON_MIN = 68.5;
const GRID_LON_MAX = 97.5;

interface HexCenter {
  lat: number;
  lon: number;
}

function generateHexCenters(): HexCenter[] {
  const centers: HexCenter[] = [];
  const rowH = HEX_SPACING_DEG * Math.sqrt(3) / 2;
  let row = 0;
  for (let lat = GRID_LAT_MIN; lat <= GRID_LAT_MAX; lat += rowH) {
    const offset = row % 2 === 0 ? 0 : HEX_SPACING_DEG / 2;
    for (let lon = GRID_LON_MIN + offset; lon <= GRID_LON_MAX; lon += HEX_SPACING_DEG) {
      if (pointInIndia(lon, lat)) {
        centers.push({ lat, lon });
      }
    }
    row++;
  }
  return centers;
}

/* ── Compute per-airport fare pressure from route fixtures ── */
interface AirportPressure {
  iata: string;
  lat: number;
  lon: number;
  pressure: number; // 0–1
  avgFare: number;
  momChange: number;
  observations: number;
}

function computeAirportPressures(): AirportPressure[] {
  // For each airport, aggregate route data
  const byAirport = new Map<string, { totalChange: number; totalFare: number; totalObs: number; count: number }>();

  for (const r of fixtureRoutes) {
    for (const iata of [r.origin, r.destination]) {
      const entry = byAirport.get(iata) ?? { totalChange: 0, totalFare: 0, totalObs: 0, count: 0 };
      entry.totalChange += r.changePct;
      entry.totalFare += r.averageFare;
      entry.totalObs += r.observations;
      entry.count += 1;
      byAirport.set(iata, entry);
    }
  }

  // Normalize changePct to 0–1 pressure
  const entries = [...byAirport.entries()];
  const changes = entries.map(([, v]) => v.totalChange / v.count);
  const minChange = Math.min(...changes);
  const maxChange = Math.max(...changes);
  const range = maxChange - minChange || 1;

  return entries.map(([iata, v]) => {
    const airport = fixtureAirports.find(a => a.iata === iata);
    if (!airport) return null;
    const avgChange = v.totalChange / v.count;
    return {
      iata,
      lat: airport.lat,
      lon: airport.lon,
      pressure: Math.max(0, Math.min(1, (avgChange - minChange) / range)),
      avgFare: Math.round(v.totalFare / v.count),
      momChange: +(avgChange.toFixed(1)),
      observations: Math.round(v.totalObs / v.count),
    };
  }).filter(Boolean) as AirportPressure[];
}

/** Haversine distance in km (simplified for interpolation weighting). */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 0.01745329;
  const dLon = (lon2 - lon1) * 0.01745329;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * 0.01745329) * Math.cos(lat2 * 0.01745329) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Generate cells ── */
function buildFixtureCells(): HeatmapCell[] {
  const hexCenters = generateHexCenters();
  const pressures = computeAirportPressures();

  return hexCenters.map((hex, idx) => {
    // IDW interpolation: weight = 1 / dist^2, capped at 50km min
    let wSum = 0;
    let vSum = 0;
    let fSum = 0;
    let mSum = 0;
    let oSum = 0;
    let nearest = pressures[0];
    let nearestDist = Infinity;

    for (const ap of pressures) {
      const d = Math.max(50, distKm(hex.lat, hex.lon, ap.lat, ap.lon));
      const w = 1 / (d * d);
      wSum += w;
      vSum += w * ap.pressure;
      fSum += w * ap.avgFare;
      mSum += w * ap.momChange;
      oSum += w * ap.observations;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = ap;
      }
    }

    return {
      id: `hex_${String(idx + 1).padStart(3, '0')}`,
      lat: +hex.lat.toFixed(3),
      lon: +hex.lon.toFixed(3),
      value: +(vSum / wSum).toFixed(3),
      avg_fare: Math.round(fSum / wSum),
      mom_change: +(mSum / wSum).toFixed(1),
      observation_count: Math.round(oSum / wSum),
      nearest_airport: nearest.iata,
    };
  });
}

/** Stable fixture cells — computed once at module load. */
const FIXTURE_CELLS = buildFixtureCells();

/** Build a complete HeatmapResponse fixture. */
export function buildHeatmapFixture(
  range: TimeRange = '30d',
  metric: HeatmapMetric = 'fare_pressure',
): HeatmapResponse {
  // Apply range multiplier for slight variation
  const multiplier =
    range === 'today' ? 1.15 : range === '7d' ? 1.05 : range === '1y' ? 0.85 : 1.0;

  const cells =
    multiplier === 1.0
      ? FIXTURE_CELLS
      : FIXTURE_CELLS.map(c => ({
          ...c,
          value: +Math.max(0, Math.min(1, c.value * multiplier)).toFixed(3),
          mom_change: +(c.mom_change * multiplier).toFixed(1),
        }));

  return {
    metric,
    range,
    dataState: 'MOCK',
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    cells,
  };
}

/** Hex radius in degrees for rendering. */
export const HEATMAP_HEX_RADIUS_DEG = HEX_RADIUS_DEG;
