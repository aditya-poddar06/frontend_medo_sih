export type DataState = 'LIVE' | 'CACHED' | 'DELAYED' | 'UNAVAILABLE' | 'MOCK';
export type BookingWindow = 'T+1' | 'T+7' | 'T+15' | 'T+30' | 'T+45';
export type FareTrend = 'rising' | 'falling' | 'stable';
export type TimeRange = 'today' | '7d' | '30d' | '1y' | '6m';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  region?: string;
}

export interface RouteSummary {
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  averageFare: number;
  changePct: number;
  trend: FareTrend;
  status: string;
  typicalRange: [number, number];
  bestBookingWindow: BookingWindow;
  observations: number;
  airlinesMonitored: number;
  weight: number;
  confidence: number;
}

export interface ExploreDashboard {
  dataState: DataState;
  updatedAt: string;
  nationalChangePct: number;
  summary: {
    risingFastest: RouteSummary;
    fallingFastest: RouteSummary;
    bestBookingWindow: string;
    routesMonitored: number;
    airportsCovered: number;
    observations: number;
  };
  routes: RouteSummary[];
  selectedRoute?: RouteSummary;
  fareTrend: { date: string; fare: number }[];
  bookingWindowComparison: { window: BookingWindow; label: string; fare: number }[];
  playback: { period: string; routes: RouteSummary[] }[];
}

export interface AnalyticsDashboard {
  dataState: DataState;
  updatedAt: string;
  nationalAirfareIndex: number;
  indexBase: string;
  averageFare: number;
  momChangePct: number;
  yoyChangePct: number;
  routesMonitored: number;
  airportsCovered: number;
  totalObservations: number;
  indexTrend: { date: string; index: number }[];
  topRisingRoutes: { route: string; changePct: number; fare: number }[];
  bookingWindowAverages: { window: BookingWindow; label: string; fare: number }[];
  airlineMovement: { airline: string; changePct: number }[];
  indexVsCpi: { date: string; airfareIndex: number; transportCpi: number }[];
  keyInsights: string[];
}

export interface AnalyticsFilters {
  range: TimeRange;
  region: string;
  route: string;
  airline: string;
  bookingWindow: string;
  fareType: string;
}

export interface SystemStatus {
  dataState: DataState;
  updatedAt: string;
  sources: { name: string; status: string; lastUpdate?: string; records?: number }[];
  scrapingAgents: { online: number; total: number };
  postgresql: string;
  mathEngine: string;
  lastScrapeAgo: string;
  recordsToday: number;
  rejected: number;
  duplicates: number;
  outliers: number;
  browserAgent: {
    status: string;
    browserConnected: boolean;
    source: string | null;
    route: string | null;
    stage: string | null;
    recordsThisTask: number | null;
  };
}

export interface HealthResponse {
  status: string;
  version?: string;
  database?: string;
  api?: string;
  latencyMs?: number;
}

export interface ScraperStatus {
  status: 'idle' | 'starting' | 'running' | 'paused' | 'completed' | 'failed';
  browser_connected: boolean;
  source: string | null;
  route: string | null;
  stage: string | null;
  records_collected: number | null;
  started_at: string | null;
  last_activity_at: string | null;
}

export interface LiveFlight {
  id: string;
  callsign: string;
  icao24: string;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  velocity: number;
  onGround: boolean;
  lastContact: number;
}

/* ── Heat Map ── */

export type HeatmapMetric =
  | 'fare_pressure'
  | 'avg_fare'
  | 'mom_change'
  | 'yoy_change'
  | 'volatility'
  | 'observation_density';

export interface HeatmapCell {
  id: string;
  lat: number;
  lon: number;
  /** Normalized fare-pressure value 0.0–1.0 */
  value: number;
  avg_fare: number;
  mom_change: number;
  observation_count: number;
  nearest_airport: string;
}

export interface HeatmapResponse {
  metric: HeatmapMetric;
  range: TimeRange;
  dataState: DataState;
  updated_at: string;
  cells: HeatmapCell[];
}

