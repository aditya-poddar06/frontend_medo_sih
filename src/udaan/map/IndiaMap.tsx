import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { config } from '@udaan/app/config';
import type { Airport, LiveFlight, RouteSummary } from '@udaan/services/types';
import { upsertAirportLayer } from './AirportLayer';
import { upsertRouteLayer } from './RouteLayer';
import {
  clearAircraftLayer,
  getFlightForEntity,
  tickAircraftInterpolation,
  upsertAircraftLayer,
} from './AircraftLayer';
import { flyBackToIndia, flyToRoute, setIndiaTopDown } from './CameraController';
import { isInCorridor, LIVE_FLIGHT_CORRIDOR_RADIUS_KM } from './corridorFilter';
import { formatInr, formatPct, routeKey } from '@udaan/state/dashboard';
import '@udaan/styles/map.css';

export interface IndiaMapProps {
  airports: Airport[];
  routes: RouteSummary[];
  /** Only the selected route to render (or null for no route lines). */
  selectedRoute: RouteSummary | null;
  selectedRouteKey: string | null;
  focusAirport: string | null;
  liveFlightsEnabled: boolean;
  liveFlights: LiveFlight[];
  onSelectRoute: (origin: string, destination: string) => void;
  onSelectAirport: (iata: string) => void;
}

export function IndiaMap({
  airports,
  routes,
  selectedRoute,
  selectedRouteKey,
  focusAirport,
  liveFlightsEnabled,
  liveFlights,
  onSelectRoute,
  onSelectAirport,
}: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const propsRef = useRef({
    airports,
    routes,
    selectedRoute,
    selectedRouteKey,
    focusAirport,
    onSelectRoute,
    onSelectAirport,
  });
  propsRef.current = {
    airports,
    routes,
    selectedRoute,
    selectedRouteKey,
    focusAirport,
    onSelectRoute,
    onSelectAirport,
  };
  const hoveredRef = useRef<string | null>(null);
  const prevRouteKeyRef = useRef<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    lines: string[];
  } | null>(null);
  const [aircraftInfo, setAircraftInfo] = useState<{
    x: number;
    y: number;
    data: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    if (config.cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = config.cesiumIonToken;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      selectionIndicator: false,
      infoBox: false,
      baseLayer: false,
    });

    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        credit: '© OpenStreetMap contributors',
      }),
    );

    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#E8E4DE');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#D9D4CC');
    viewer.targetFrameRate = 60;
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Infinity;

    setIndiaTopDown(viewer);
    viewerRef.current = viewer;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    const paintRoutes = (hoveredKey: string | null) => {
      const p = propsRef.current;
      const ends = p.selectedRouteKey ? p.selectedRouteKey.split('-') : [];
      upsertAirportLayer(viewer, p.airports, p.focusAirport, ends);
      // Only show selected route, not all routes
      const routesToShow = p.selectedRoute ? [p.selectedRoute] : [];
      upsertRouteLayer(viewer, routesToShow, p.airports, p.selectedRouteKey, p.focusAirport, hoveredKey);
      viewer.scene.requestRender();
    };

    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.endPosition);
      if (!Cesium.defined(picked) || !picked.id?.properties) {
        setTooltip(null);
        if (hoveredRef.current) {
          hoveredRef.current = null;
          paintRoutes(null);
        }
        return;
      }
      const props = picked.id.properties;
      const kind = props.kind?.getValue?.() ?? props.kind;
      if (kind === 'route') {
        const origin = String(props.origin?.getValue?.() ?? props.origin);
        const destination = String(props.destination?.getValue?.() ?? props.destination);
        const fare = Number(props.averageFare?.getValue?.() ?? props.averageFare);
        const change = Number(props.changePct?.getValue?.() ?? props.changePct);
        const obs = Number(props.observations?.getValue?.() ?? props.observations);
        const key = `${origin}-${destination}`;
        setTooltip({
          x: movement.endPosition.x,
          y: movement.endPosition.y,
          lines: [
            `${origin} → ${destination}`,
            formatInr(fare),
            formatPct(change),
            `${obs.toLocaleString('en-IN')} price observations`,
          ],
        });
        if (hoveredRef.current !== key) {
          hoveredRef.current = key;
          paintRoutes(key);
        } else {
          viewer.scene.requestRender();
        }
      } else {
        setTooltip(null);
        if (hoveredRef.current) {
          hoveredRef.current = null;
          paintRoutes(null);
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (!Cesium.defined(picked) || !picked.id?.properties) {
        setAircraftInfo(null);
        return;
      }
      const props = picked.id.properties;
      const kind = props.kind?.getValue?.() ?? props.kind;
      const p = propsRef.current;
      if (kind === 'route') {
        setAircraftInfo(null);
        p.onSelectRoute(
          String(props.origin?.getValue?.() ?? props.origin),
          String(props.destination?.getValue?.() ?? props.destination),
        );
      } else if (kind === 'airport') {
        setAircraftInfo(null);
        p.onSelectAirport(String(props.iata?.getValue?.() ?? props.iata));
      } else if (kind === 'aircraft') {
        const entityId = picked.id.id;
        const flight = getFlightForEntity(entityId);
        if (flight) {
          const lastSeen = flight.lastContact
            ? new Date(flight.lastContact * 1000).toLocaleTimeString()
            : 'N/A';
          setAircraftInfo({
            x: click.position.x,
            y: click.position.y,
            data: {
              Callsign: flight.callsign || '—',
              ICAO24: flight.icao24 || '—',
              Altitude: `${Math.round(flight.alt * 3.28084).toLocaleString()} ft`,
              Speed: `${Math.round(flight.velocity * 1.944)} kts`,
              Heading: `${Math.round(flight.heading)}°`,
              'Last update': lastSeen,
              Source: 'OpenSky Network',
            },
          });
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      clearAircraftLayer(viewer);
      viewer.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update airport markers & route layer when data changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const ends = selectedRouteKey ? selectedRouteKey.split('-') : [];
    upsertAirportLayer(viewer, airports, focusAirport, ends);
    // Only show selected route
    const routesToShow = selectedRoute ? [selectedRoute] : [];
    upsertRouteLayer(
      viewer,
      routesToShow,
      airports,
      selectedRouteKey,
      focusAirport,
      hoveredRef.current,
    );
    viewer.scene.requestRender();
  }, [airports, routes, selectedRoute, selectedRouteKey, focusAirport]);

  // Camera focus on route selection / deselection
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const prevKey = prevRouteKeyRef.current;
    prevRouteKeyRef.current = selectedRouteKey;

    if (selectedRouteKey && selectedRouteKey !== prevKey) {
      // Find the airports for this route
      const parts = selectedRouteKey.split('-');
      if (parts.length === 2) {
        const originAirport = airports.find(a => a.iata === parts[0]);
        const destAirport = airports.find(a => a.iata === parts[1]);
        if (originAirport && destAirport) {
          flyToRoute(viewer, originAirport.lon, originAirport.lat, destAirport.lon, destAirport.lat);
        }
      }
    } else if (!selectedRouteKey && prevKey) {
      // Route cleared, return to India overview
      flyBackToIndia(viewer);
    }
  }, [selectedRouteKey, airports]);

  // Live aircraft layer with corridor filtering
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (!liveFlightsEnabled) {
      clearAircraftLayer(viewer);
      viewer.scene.requestRender();
      return;
    }

    // Compute corridor membership
    let corridorIds: Set<string> | undefined;
    if (selectedRouteKey) {
      const parts = selectedRouteKey.split('-');
      if (parts.length === 2) {
        const originAirport = airports.find(a => a.iata === parts[0]);
        const destAirport = airports.find(a => a.iata === parts[1]);
        if (originAirport && destAirport) {
          corridorIds = new Set<string>();
          for (const f of liveFlights) {
            if (
              isInCorridor(
                f.lat, f.lon,
                originAirport.lat, originAirport.lon,
                destAirport.lat, destAirport.lon,
                LIVE_FLIGHT_CORRIDOR_RADIUS_KM,
              )
            ) {
              corridorIds.add(f.id);
            }
          }
          if (import.meta.env.DEV) {
            console.log(
              `[UDAAN Flight] Corridor ${selectedRouteKey}: ` +
              `${corridorIds.size}/${liveFlights.length} aircraft in corridor`
            );
          }
        }
      }
    }

    upsertAircraftLayer(viewer, liveFlights, null, corridorIds);
    let raf = 0;
    const loop = () => {
      tickAircraftInterpolation(viewer);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [liveFlightsEnabled, liveFlights, selectedRouteKey, airports]);

  return (
    <div className="map-stage">
      <div ref={containerRef} className="udaan-cesium-root" />
      {tooltip && (
        <div className="udaan-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
      {aircraftInfo && (
        <div
          className="udaan-aircraft-info"
          style={{ left: aircraftInfo.x, top: aircraftInfo.y }}
        >
          <div className="aircraft-info-header">
            <span>✈ {aircraftInfo.data.Callsign}</span>
            <button
              type="button"
              className="aircraft-info-close"
              onClick={() => setAircraftInfo(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {Object.entries(aircraftInfo.data)
            .filter(([key]) => key !== 'Callsign')
            .map(([key, value]) => (
              <div className="aircraft-info-row" key={key}>
                <span className="aircraft-info-label">{key}</span>
                <span className="aircraft-info-value">{value}</span>
              </div>
            ))}
        </div>
      )}
      {liveFlightsEnabled && liveFlights.length === 0 && (
        <div className="udaan-no-flights">No live aircraft currently available in this view.</div>
      )}
    </div>
  );
}

export { routeKey };
