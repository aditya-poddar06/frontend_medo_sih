import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IndiaMap } from '@udaan/map/IndiaMap';
import type { MapMode } from '@udaan/map/IndiaMap';
import { ScraperBrowserPanel } from '@udaan/components/browser/ScraperBrowserPanel';
import { BookingWindowChart, FareTrendChart } from '@udaan/components/charts/Charts';
import { getAirports, getExploreDashboard, getRouteDetails } from '@udaan/services/explore';
import { getHeatmapData } from '@udaan/services/heatmap';
import { getLiveFlights } from '@udaan/services/liveFlights';
import type { Airport, ExploreDashboard, HeatmapCell, HeatmapResponse, LiveFlight, RouteSummary, TimeRange } from '@udaan/services/types';
import { pressureLabel } from '@udaan/map/HeatMapLayer';
import { applyPlaybackFrame } from '@udaan/map/HistoricalPlayback';
import {
  bookingWindowHuman,
  compactCount,
  fareVsTypical,
  formatInr,
  formatPct,
  parseRouteSearch,
  relativeUpdated,
  routeKey,
} from '@udaan/state/dashboard';
import { config } from '@udaan/app/config';

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '1y', label: '1Y' },
];

interface Props {
  searchQuery: string;
}

export function ExplorePage({ searchQuery }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const heroView = params.get('view') === 'browser' ? 'browser' : 'map';
  const [range, setRange] = useState<TimeRange>('30d');
  const [dash, setDash] = useState<ExploreDashboard | null>(null);
  const [selected, setSelected] = useState<RouteSummary | null>(null);
  /** Whether the user explicitly selected/searched a route (not auto-selected on load). */
  const [userSelected, setUserSelected] = useState(false);
  const [focusAirport, setFocusAirport] = useState<string | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(5);
  const [liveOn, setLiveOn] = useState(false);
  const [flights, setFlights] = useState<LiveFlight[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>('route');
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [regionalInsight, setRegionalInsight] = useState<HeatmapCell | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [data, a] = await Promise.all([getExploreDashboard(range), getAirports()]);
      if (cancelled) return;
      setDash(data);
      setSelected(data.selectedRoute ?? data.routes[0] ?? null);
      setUserSelected(false); // auto-selected, not user action
      setAirports(a);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const selectRoute = useCallback(async (origin: string, destination: string) => {
    const detail = await getRouteDetails(origin, destination);
    setSelected(detail);
    setUserSelected(true); // explicit user action
    setFocusAirport(null);
    setDash((prev) =>
      prev
        ? {
            ...prev,
            selectedRoute: detail,
            fareTrend: detail.fareTrend ?? prev.fareTrend,
            bookingWindowComparison:
              detail.bookingWindowComparison ?? prev.bookingWindowComparison,
          }
        : prev,
    );
  }, []);

  useEffect(() => {
    if (!searchQuery || !airports.length || !dash) return;
    const parsed = parseRouteSearch(searchQuery, airports);
    if (!parsed) return;
    if (parsed.origin && parsed.destination) {
      void selectRoute(parsed.origin.iata, parsed.destination.iata);
      setFocusAirport(null);
    } else if (parsed.airport) {
      setFocusAirport(parsed.airport.iata);
    }
  }, [searchQuery, airports, dash, selectRoute]);

  // ── Heatmap data fetch ──
  useEffect(() => {
    if (mapMode !== 'heat') return;
    let cancelled = false;
    void (async () => {
      const data = await getHeatmapData(range, 'fare_pressure');
      if (!cancelled) setHeatmapData(data);
    })();
    return () => { cancelled = true; };
  }, [mapMode, range]);

  const handleSelectCell = useCallback((cellId: string, cell: HeatmapCell) => {
    setSelectedCellId(cellId);
    setRegionalInsight(cell);
  }, []);

  useEffect(() => {
    if (!liveOn) {
      setFlights([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      const list = await getLiveFlights();
      if (!cancelled) setFlights(list);
    };
    void load();
    const id = window.setInterval(load, 15000);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [liveOn]);

  const displayRoutes = useMemo(() => {
    if (!dash) return [];
    const frame = applyPlaybackFrame(dash.playback, playbackIndex);
    return frame?.routes ?? dash.routes;
  }, [dash, playbackIndex]);

  const setHeroView = (view: 'map' | 'browser') => {
    const next = new URLSearchParams(params);
    if (view === 'browser') next.set('view', 'browser');
    else next.delete('view');
    setParams(next, { replace: true });
  };

  if (!dash || !selected) {
    return (
      <div className="explore-page">
        <div className="udaan-panel">Loading Explore…</div>
      </div>
    );
  }

  const deltaClass =
    selected.changePct > 2 ? 'up' : selected.changePct < -2 ? 'down' : 'flat';
  const routeLabel = `${selected.originCity} → ${selected.destinationCity}`;
  const rising = dash.summary.risingFastest;
  const nationalAbs = Math.abs(dash.nationalChangePct).toFixed(1);
  const nationalDir = dash.nationalChangePct >= 0 ? 'higher' : 'lower';
  const bookDays = bookingWindowHuman(selected.bestBookingWindow);

  return (
    <div className="explore-page">
      <div className="explore-context">
        <div className="explore-title-row">
          <div>
            <h1>Airfare trend across India</h1>
            <p className="lede">Real-time domestic fare movement</p>
          </div>
          <div className="explore-national">
            <div className={`metric-value metric-delta ${dash.nationalChangePct >= 0 ? 'up' : 'down'}`}>
              {formatPct(dash.nationalChangePct)}
            </div>
            <div className="meta">
              this month · {relativeUpdated(dash.updatedAt)}
              {config.useMockData && <span className="badge-mock">MOCK</span>}
            </div>
          </div>
        </div>
        <p className="national-insight">
          India snapshot: Airfares are <strong>{nationalAbs}%</strong> {nationalDir} this month,
          led by{' '}
          <strong>
            {rising.originCity} → {rising.destinationCity}
          </strong>{' '}
          ({formatPct(rising.changePct)}). Lowest average fares are currently around{' '}
          <strong>30 days</strong> before departure.
        </p>
      </div>

      <div className="explore-toolbar">
        <div className="seg" role="group" aria-label="Map mode">
          <button
            type="button"
            className={mapMode === 'route' && heroView === 'map' ? 'active' : ''}
            onClick={() => { setMapMode('route'); setHeroView('map'); }}
          >
            Route View
          </button>
          <button
            type="button"
            className={mapMode === 'heat' && heroView === 'map' ? 'active' : ''}
            onClick={() => { setMapMode('heat'); setHeroView('map'); }}
          >
            Heat Map
          </button>
        </div>

        <div className="seg" role="group" aria-label="Panel mode">
          <button
            type="button"
            className={heroView === 'browser' ? 'active' : ''}
            onClick={() => setHeroView('browser')}
          >
            Scraper Browser
          </button>
        </div>

        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={range === r.id ? 'active' : ''}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {mapMode === 'route' && (
          <div className="legend-row">
            <span>
              <i className="legend-dot rising" /> Rising
            </span>
            <span>
              <i className="legend-dot falling" /> Falling
            </span>
            <span>
              <i className="legend-dot stable" /> Stable
            </span>
          </div>
        )}
        {mapMode === 'heat' && heatmapData?.dataState === 'MOCK' && (
          <div className="legend-row">
            <span className="badge-mock">MOCK DATA</span>
          </div>
        )}

        <label className="toolbar-live">
          <input type="checkbox" checked={liveOn} onChange={(e) => setLiveOn(e.target.checked)} />
          Live flights
        </label>
      </div>

      <div className="explore-hero">
        <div className="explore-viz">
          <div
            className="explore-viz-map"
            style={{ display: heroView === 'map' ? 'flex' : 'none' }}
          >
            <IndiaMap
              airports={airports}
              routes={displayRoutes}
              selectedRoute={userSelected ? selected : null}
              selectedRouteKey={userSelected ? routeKey(selected) : null}
              focusAirport={focusAirport}
              liveFlightsEnabled={liveOn}
              liveFlights={flights}
              onSelectRoute={(o, d) => void selectRoute(o, d)}
              onSelectAirport={(iata) => setFocusAirport(iata)}
              mapMode={mapMode}
              heatmapCells={heatmapData?.cells ?? []}
              selectedCellId={selectedCellId}
              onSelectCell={handleSelectCell}
            />
            <div className="playback-bar">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => setPlaybackIndex((i) => Math.max(0, i - 1))}
              >
                ‹
              </button>
              {(dash.playback ?? []).map((p, i) => (
                <button
                  key={p.period}
                  type="button"
                  className={playbackIndex === i ? 'active' : ''}
                  onClick={() => setPlaybackIndex(i)}
                >
                  {p.period}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next period"
                onClick={() =>
                  setPlaybackIndex((i) => Math.min((dash.playback?.length ?? 1) - 1, i + 1))
                }
              >
                ›
              </button>
            </div>
          </div>
          <ScraperBrowserPanel active={heroView === 'browser'} />
        </div>

        <aside className="route-panel">
          <div className="micro-label">Selected route</div>
          <div className="route-title">{routeLabel}</div>
          <div className="route-codes">
            {selected.origin} → {selected.destination}
          </div>
          <div className="fare-block">
            <div className="metric-value">{formatInr(selected.averageFare)}</div>
            <div className={`metric-delta ${deltaClass}`}>
              {formatPct(selected.changePct)} from last month
            </div>
          </div>
          <div className={`route-insight ${deltaClass}`}>{selected.status}</div>
          <div className="stat-row">
            <span>Typical fare</span>
            <strong>
              {formatInr(selected.typicalRange[0])} – {formatInr(selected.typicalRange[1])}
            </strong>
          </div>
          <div className="stat-row">
            <span>Best time to book</span>
            <strong>{bookingWindowHuman(selected.bestBookingWindow)}</strong>
          </div>
          <div className="stat-row">
            <span>Price observations</span>
            <strong>{selected.observations.toLocaleString('en-IN')}</strong>
          </div>
          <div className="stat-row">
            <span>Airlines monitored</span>
            <strong>{selected.airlinesMonitored}</strong>
          </div>
          <div className="fare-insight">
            <div className="micro-label">Fare insight</div>
            <p>{fareVsTypical(selected.averageFare, selected.typicalRange)}</p>
            <p>Booking around {bookDays} currently offers the lowest average fare on this route.</p>
          </div>
          <button
            type="button"
            className="route-analysis-link"
            onClick={() =>
              navigate(`/analytics?route=${selected.origin}-${selected.destination}`)
            }
          >
            View full route analysis →
          </button>
          {mapMode === 'heat' && regionalInsight && (
            <div className="udaan-regional-insight">
              <div className="micro-label">Regional insight</div>
              <div className="route-title">{regionalInsight.nearest_airport} region</div>
              <div className="stat-row">
                <span>Pressure</span>
                <strong>{pressureLabel(regionalInsight.value)}</strong>
              </div>
              <div className="stat-row">
                <span>Avg fare</span>
                <strong>{formatInr(regionalInsight.avg_fare)}</strong>
              </div>
              <div className="stat-row">
                <span>MoM</span>
                <strong>{formatPct(regionalInsight.mom_change)}</strong>
              </div>
              <div className="stat-row">
                <span>Observations</span>
                <strong>{regionalInsight.observation_count.toLocaleString('en-IN')}</strong>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="metric-strip">
        <div className="cell">
          <div className="label">Fastest rising</div>
          <div className="value mono">
            {dash.summary.risingFastest.origin} → {dash.summary.risingFastest.destination}
          </div>
          <div className="sub metric-delta up">
            {formatPct(dash.summary.risingFastest.changePct)}
          </div>
        </div>
        <div className="cell">
          <div className="label">Fastest falling</div>
          <div className="value mono">
            {dash.summary.fallingFastest.origin} → {dash.summary.fallingFastest.destination}
          </div>
          <div className="sub metric-delta down">
            {formatPct(dash.summary.fallingFastest.changePct)}
          </div>
        </div>
        <div className="cell">
          <div className="label">Best time to book</div>
          <div className="value">30 days ahead</div>
        </div>
        <div className="cell">
          <div className="label">Routes tracked</div>
          <div className="value mono">{dash.summary.routesMonitored}</div>
        </div>
        <div className="cell">
          <div className="label">Airports</div>
          <div className="value mono">{dash.summary.airportsCovered}</div>
        </div>
        <div className="cell">
          <div className="label">Price observations</div>
          <div className="value mono">{compactCount(dash.summary.observations)}</div>
        </div>
      </div>

      <div className="charts-row">
        <FareTrendChart data={dash.fareTrend} title={`Fare trend — ${routeLabel}`} compact />
        <BookingWindowChart
          data={dash.bookingWindowComparison}
          title={`Best time to book — ${routeLabel}`}
          compact
        />
      </div>
    </div>
  );
}
