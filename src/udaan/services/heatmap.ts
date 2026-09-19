import { config } from '@udaan/app/config';
import { apiFetch } from './api';
import { buildHeatmapFixture } from './fixtures/heatmap';
import type { HeatmapMetric, HeatmapResponse, TimeRange } from './types';

/**
 * Fetch heatmap data. Tries backend first, falls back to fixture.
 */
export async function getHeatmapData(
  range: TimeRange = '30d',
  metric: HeatmapMetric = 'fare_pressure',
): Promise<HeatmapResponse> {
  if (config.useMockData) return buildHeatmapFixture(range, metric);
  try {
    return await apiFetch<HeatmapResponse>(
      `/map/heatmap?range=${encodeURIComponent(range)}&metric=${encodeURIComponent(metric)}`,
    );
  } catch {
    return buildHeatmapFixture(range, metric);
  }
}
