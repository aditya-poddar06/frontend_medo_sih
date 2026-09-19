import { config } from '@udaan/app/config';
import { apiFetch, fetchHealth } from './api';
import { fixtureSystemStatus, fixtureScraperStatus, fixtureLiveFlights } from './fixtures/systemStatus';
import type { HealthResponse, LiveFlight, ScraperStatus, SystemStatus } from './types';
import type { AnalyticsFilters } from './types';

export async function getSystemStatus(): Promise<SystemStatus> {
  if (config.useMockData) return { ...fixtureSystemStatus, dataState: 'MOCK' };
  try {
    return await apiFetch<SystemStatus>('/system/status');
  } catch {
    return { ...fixtureSystemStatus, dataState: 'UNAVAILABLE' };
  }
}

export async function getHealth(): Promise<HealthResponse & { ok: boolean; endpoint: string }> {
  const result = await fetchHealth();
  return {
    ok: result.ok,
    endpoint: result.endpoint,
    status: result.ok ? String(result.body?.status ?? 'ok') : 'unavailable',
    version: result.body?.version != null ? String(result.body.version) : undefined,
    database: result.body?.database != null ? String(result.body.database) : undefined,
    api: result.body?.api != null ? String(result.body.api) : undefined,
    latencyMs: result.latencyMs,
  };
}

export async function getScraperStatus(): Promise<ScraperStatus | null> {
  if (config.useMockData) return fixtureScraperStatus;
  try {
    return await apiFetch<ScraperStatus>('/scraper/status');
  } catch {
    return null;
  }
}

/* ── India bounding box for OpenSky ── */
const INDIA_BBOX = { lamin: 6.5, lomin: 68, lamax: 37, lomax: 97.5 };

/** Max age in seconds before we consider a contact stale. */
const MAX_CONTACT_AGE_S = 300; // 5 minutes

/**
 * Normalize an OpenSky state-vector array into a LiveFlight object.
 * State vector indices:
 *  0: icao24, 1: callsign, 2: origin_country, 3: time_position,
 *  4: last_contact, 5: longitude, 6: latitude, 7: baro_altitude,
 *  8: on_ground, 9: velocity, 10: true_track, ...
 */
function normalizeStateVector(sv: unknown[]): LiveFlight | null {
  const icao24 = String(sv[0] ?? '').trim();
  const callsign = String(sv[1] ?? '').trim();
  const lastContact = typeof sv[4] === 'number' ? sv[4] : 0;
  const lon = typeof sv[5] === 'number' ? sv[5] : null;
  const lat = typeof sv[6] === 'number' ? sv[6] : null;
  const alt = typeof sv[7] === 'number' ? sv[7] : 0;
  const onGround = sv[8] === true;
  const velocity = typeof sv[9] === 'number' ? sv[9] : 0;
  const heading = typeof sv[10] === 'number' ? sv[10] : 0;

  // Skip aircraft with invalid coordinates
  if (lat === null || lon === null) return null;
  // Skip aircraft on ground
  if (onGround) return null;
  // Skip stale contacts
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (lastContact > 0 && nowEpoch - lastContact > MAX_CONTACT_AGE_S) return null;

  return {
    id: icao24,
    icao24,
    callsign: callsign || icao24,
    lat,
    lon,
    alt,
    heading,
    velocity,
    onGround,
    lastContact,
  };
}

/**
 * Fetch live aircraft. Tries backend first, falls back to OpenSky anonymous API.
 */
export async function getLiveFlights(bbox?: string): Promise<LiveFlight[]> {
  if (config.useMockData) return fixtureLiveFlights;

  // 1. Try our backend
  try {
    const q = bbox ? `?bbox=${encodeURIComponent(bbox)}` : '';
    const result = await apiFetch<LiveFlight[]>(`/live-flights${q}`);
    if (Array.isArray(result) && result.length > 0) {
      if (import.meta.env.DEV) {
        console.log('[UDAAN Flight] Backend returned', result.length, 'aircraft');
      }
      return result;
    }
  } catch {
    if (import.meta.env.DEV) {
      console.log('[UDAAN Flight] Backend /live-flights unavailable, trying OpenSky direct');
    }
  }

  // 2. Fallback: direct OpenSky anonymous API (no auth needed)
  try {
    const { lamin, lomin, lamax, lomax } = INDIA_BBOX;
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (res.status === 429) {
      if (import.meta.env.DEV) {
        console.warn('[UDAAN Flight] OpenSky rate limited (429). Will retry next cycle.');
      }
      return [];
    }
    if (!res.ok) {
      if (import.meta.env.DEV) {
        console.warn('[UDAAN Flight] OpenSky HTTP', res.status);
      }
      return [];
    }

    const data = await res.json() as { time?: number; states?: unknown[][] };
    const states = data.states ?? [];

    if (import.meta.env.DEV) {
      let validCount = 0;
      let groundCount = 0;
      let nullCoordCount = 0;
      let staleCount = 0;
      for (const sv of states) {
        if (sv[5] === null || sv[6] === null) { nullCoordCount++; continue; }
        if (sv[8] === true) { groundCount++; continue; }
        const lc = typeof sv[4] === 'number' ? sv[4] : 0;
        const nowE = Math.floor(Date.now() / 1000);
        if (lc > 0 && nowE - lc > MAX_CONTACT_AGE_S) { staleCount++; continue; }
        validCount++;
      }
      console.log(
        `[UDAAN Flight] OpenSky: ${states.length} states received, ` +
        `${validCount} valid airborne, ${groundCount} on-ground, ` +
        `${nullCoordCount} null-coords, ${staleCount} stale`
      );
    }

    const flights: LiveFlight[] = [];
    for (const sv of states) {
      const f = normalizeStateVector(sv);
      if (f) flights.push(f);
    }
    return flights;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[UDAAN Flight] OpenSky fetch failed:', err);
    }
    return [];
  }
}

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export async function exportAnalytics(
  format: ExportFormat,
  filters: Partial<AnalyticsFilters>,
): Promise<{ ok: boolean; message: string; blob?: Blob }> {
  if (config.useMockData) {
    const payload = JSON.stringify({ format, filters, note: 'MOCK export — backend not connected' }, null, 2);
    return {
      ok: true,
      message: 'Mock export generated (development)',
      blob: new Blob([payload], { type: 'application/json' }),
    };
  }
  const qs = new URLSearchParams({
    format,
    range: filters.range ?? '6m',
    region: filters.region ?? 'all-india',
    route: filters.route ?? 'all',
    airline: filters.airline ?? 'all',
    booking_window: filters.bookingWindow ?? 'all',
    fare_type: filters.fareType ?? 'economy',
  });
  try {
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/analytics/export?${qs}`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    return { ok: true, message: 'Export ready', blob };
  } catch {
    return { ok: false, message: 'Export unavailable — backend not reachable' };
  }
}

export { getHealth as healthService };
