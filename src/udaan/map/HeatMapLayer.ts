/**
 * HeatMapLayer — Cesium hex-grid rendering for airfare pressure.
 *
 * Each cell is a flat-top hexagonal polygon entity with fill color
 * interpolated from a green→yellow→orange→red professional color scale.
 */
import * as Cesium from 'cesium';
import type { HeatmapCell } from '@udaan/services/types';
import { HEATMAP_HEX_RADIUS_DEG } from '@udaan/services/fixtures/heatmap';

const HEAT_DS = 'udaan-heatmap';

/* ── Centralized fare-pressure thresholds ── */
export const PRESSURE_THRESHOLDS = [
  { max: 0.20, label: 'Cooling',      color: [45, 106, 79] },   // #2D6A4F
  { max: 0.40, label: 'Below normal', color: [82, 183, 136] },  // #52B788
  { max: 0.60, label: 'Normal',       color: [233, 196, 106] }, // #E9C46A
  { max: 0.80, label: 'Elevated',     color: [231, 111, 81] },  // #E76F51
  { max: 1.00, label: 'High',         color: [193, 18, 31] },   // #C1121F
] as const;

const COLOR_STOPS: { t: number; r: number; g: number; b: number }[] = [
  { t: 0.00, r: 45,  g: 106, b: 79 },
  { t: 0.25, r: 82,  g: 183, b: 136 },
  { t: 0.50, r: 233, g: 196, b: 106 },
  { t: 0.70, r: 231, g: 111, b: 81 },
  { t: 1.00, r: 193, g: 18,  b: 31 },
];

/** Get the textual pressure label for a normalized value. */
export function pressureLabel(value: number): string {
  for (const t of PRESSURE_THRESHOLDS) {
    if (value <= t.max) return t.label;
  }
  return 'High';
}

/** Continuous color interpolation for a 0–1 value. */
export function pressureColor(value: number, alpha = 0.55): Cesium.Color {
  const v = Math.max(0, Math.min(1, value));
  // Find the two surrounding stops
  let lo = COLOR_STOPS[0];
  let hi = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (v >= COLOR_STOPS[i].t && v <= COLOR_STOPS[i + 1].t) {
      lo = COLOR_STOPS[i];
      hi = COLOR_STOPS[i + 1];
      break;
    }
  }
  const range = hi.t - lo.t || 1;
  const f = (v - lo.t) / range;
  const r = (lo.r + (hi.r - lo.r) * f) / 255;
  const g = (lo.g + (hi.g - lo.g) * f) / 255;
  const b = (lo.b + (hi.b - lo.b) * f) / 255;
  return new Cesium.Color(r, g, b, alpha);
}

/** CSS color string for the legend gradient. */
export function pressureCssColor(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  let lo = COLOR_STOPS[0];
  let hi = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (v >= COLOR_STOPS[i].t && v <= COLOR_STOPS[i + 1].t) {
      lo = COLOR_STOPS[i];
      hi = COLOR_STOPS[i + 1];
      break;
    }
  }
  const range = hi.t - lo.t || 1;
  const f = (v - lo.t) / range;
  const r = Math.round(lo.r + (hi.r - lo.r) * f);
  const g = Math.round(lo.g + (hi.g - lo.g) * f);
  const b = Math.round(lo.b + (hi.b - lo.b) * f);
  return `rgb(${r},${g},${b})`;
}

/** Compute 6 vertices of a flat-top hexagon at (centerLon, centerLat). */
function hexVertices(
  centerLat: number,
  centerLon: number,
  radiusDeg: number,
): Cesium.Cartesian3[] {
  const positions: Cesium.Cartesian3[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i; // flat-top: starts at 0°
    const angleRad = (Math.PI / 180) * angleDeg;
    const lon = centerLon + radiusDeg * Math.cos(angleRad);
    // Scale latitude by cos(lat) to correct for Mercator distortion
    const lat = centerLat + radiusDeg * Math.sin(angleRad) / Math.cos((centerLat * Math.PI) / 180);
    positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 500));
  }
  return positions;
}

/**
 * Create or update the heatmap hex grid layer.
 */
export function upsertHeatMapLayer(
  viewer: Cesium.Viewer,
  cells: HeatmapCell[],
  selectedCellId: string | null,
): Cesium.CustomDataSource {
  let ds = viewer.dataSources.getByName(HEAT_DS)[0] as Cesium.CustomDataSource | undefined;
  if (!ds) {
    ds = new Cesium.CustomDataSource(HEAT_DS);
    void viewer.dataSources.add(ds);
  }
  ds.entities.removeAll();

  for (const cell of cells) {
    const isSelected = cell.id === selectedCellId;
    const alpha = isSelected ? 0.75 : 0.55;
    const outlineAlpha = isSelected ? 0.6 : 0;

    ds.entities.add({
      id: `heat-${cell.id}`,
      name: `${cell.nearest_airport} region`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(hexVertices(cell.lat, cell.lon, HEATMAP_HEX_RADIUS_DEG)),
        material: pressureColor(cell.value, alpha),
        outline: isSelected,
        outlineColor: isSelected ? Cesium.Color.WHITE.withAlpha(outlineAlpha) : undefined,
        outlineWidth: isSelected ? 1.5 : 0,
        height: 200,
      },
      properties: {
        kind: 'heatcell',
        cellId: cell.id,
        lat: cell.lat,
        lon: cell.lon,
        value: cell.value,
        avg_fare: cell.avg_fare,
        mom_change: cell.mom_change,
        observation_count: cell.observation_count,
        nearest_airport: cell.nearest_airport,
        pressureLabel: pressureLabel(cell.value),
      },
    });
  }

  return ds;
}

/** Remove the heatmap layer entirely. */
export function clearHeatMapLayer(viewer: Cesium.Viewer): void {
  const ds = viewer.dataSources.getByName(HEAT_DS)[0];
  if (ds) void viewer.dataSources.remove(ds, true);
}
