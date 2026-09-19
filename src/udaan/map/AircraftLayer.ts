import * as Cesium from 'cesium';
import type { LiveFlight } from '@udaan/services/types';
import { interpolateMotion, type MotionSample } from './AircraftMotion';

const AIRCRAFT_DS = 'udaan-aircraft';

type Track = {
  prev: MotionSample;
  next: MotionSample;
  entity: Cesium.Entity;
  flight: LiveFlight;
};

const tracks = new Map<string, Track>();

/** Cached plane canvases — one per color. */
const planeCanvasCache = new Map<string, HTMLCanvasElement>();

export function clearAircraftLayer(viewer: Cesium.Viewer): void {
  const ds = viewer.dataSources.getByName(AIRCRAFT_DS)[0];
  if (ds) void viewer.dataSources.remove(ds, true);
  tracks.clear();
}

export function upsertAircraftLayer(
  viewer: Cesium.Viewer,
  flights: LiveFlight[],
  selectedId: string | null,
  corridorIds?: Set<string>,
): Cesium.CustomDataSource {
  let ds = viewer.dataSources.getByName(AIRCRAFT_DS)[0] as Cesium.CustomDataSource | undefined;
  if (!ds) {
    ds = new Cesium.CustomDataSource(AIRCRAFT_DS);
    void viewer.dataSources.add(ds);
  }

  const now = Date.now();
  const seen = new Set<string>();

  for (const f of flights) {
    seen.add(f.id);
    const inCorridor = corridorIds?.has(f.id) ?? false;
    const sample: MotionSample = {
      lat: f.lat,
      lon: f.lon,
      alt: f.alt,
      heading: f.heading,
      t: now,
    };
    let track = tracks.get(f.id);
    if (!track) {
      const color = inCorridor ? '#0B1F3A' : '#7B8794';
      const size = inCorridor ? 20 : 16;
      const entity = ds.entities.add({
        id: `ac-${f.id}`,
        name: f.callsign || f.id,
        position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.alt),
        billboard: {
          image: createPlaneCanvas(color),
          width: size,
          height: size,
          // Icon points UP (north) by default. Rotate by -heading to align with true track.
          rotation: Cesium.Math.toRadians(-f.heading),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          kind: 'aircraft',
          id: f.id,
          callsign: f.callsign,
          icao24: f.icao24,
          altitude: f.alt,
          speed: f.velocity,
          heading: f.heading,
          lastContact: f.lastContact,
          inCorridor,
        },
      });
      track = { prev: sample, next: sample, entity, flight: f };
      tracks.set(f.id, track);
    } else {
      track.prev = track.next;
      track.next = sample;
      track.flight = f;
      // Update visual for corridor membership changes
      if (track.entity.billboard) {
        const color = inCorridor ? '#0B1F3A' : '#7B8794';
        const size = inCorridor ? 20 : 16;
        track.entity.billboard.image = new Cesium.ConstantProperty(createPlaneCanvas(color));
        track.entity.billboard.width = new Cesium.ConstantProperty(size);
        track.entity.billboard.height = new Cesium.ConstantProperty(size);
      }
    }
  }

  for (const [id, track] of tracks) {
    if (!seen.has(id)) {
      ds.entities.remove(track.entity);
      tracks.delete(id);
    }
  }

  return ds;
}

export function tickAircraftInterpolation(viewer: Cesium.Viewer): void {
  const now = Date.now();
  for (const track of tracks.values()) {
    const m = interpolateMotion(track.prev, track.next, now);
    track.entity.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(m.lon, m.lat, m.alt),
    );
    if (track.entity.billboard) {
      track.entity.billboard.rotation = new Cesium.ConstantProperty(
        Cesium.Math.toRadians(-m.heading),
      );
    }
  }
  viewer.scene.requestRender();
}

/** Get flight data for an aircraft entity by its entity ID. */
export function getFlightForEntity(entityId: string): LiveFlight | null {
  // entityId is "ac-{id}", strip the prefix
  const flightId = entityId.startsWith('ac-') ? entityId.slice(3) : entityId;
  return tracks.get(flightId)?.flight ?? null;
}

/**
 * Create a small dark airplane silhouette on a canvas.
 * The icon points north (up) by default.
 */
function createPlaneCanvas(fillColor = '#0B1F3A'): HTMLCanvasElement {
  const cached = planeCanvasCache.get(fillColor);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.translate(16, 16);
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  // Airplane shape pointing UP: nose at top, wings sweep back
  ctx.moveTo(0, -13);    // nose
  ctx.lineTo(3, -6);     // right fuselage
  ctx.lineTo(10, 2);     // right wing tip
  ctx.lineTo(10, 4);     // right wing trailing edge
  ctx.lineTo(3, 1);      // right wing root
  ctx.lineTo(2, 8);      // right tail approach
  ctx.lineTo(5, 11);     // right stabilizer tip
  ctx.lineTo(5, 12);     // right stabilizer trailing
  ctx.lineTo(0, 9);      // tail center
  ctx.lineTo(-5, 12);    // left stabilizer trailing
  ctx.lineTo(-5, 11);    // left stabilizer tip
  ctx.lineTo(-2, 8);     // left tail approach
  ctx.lineTo(-3, 1);     // left wing root
  ctx.lineTo(-10, 4);    // left wing trailing edge
  ctx.lineTo(-10, 2);    // left wing tip
  ctx.lineTo(-3, -6);    // left fuselage
  ctx.closePath();
  ctx.fill();

  planeCanvasCache.set(fillColor, c);
  return c;
}
