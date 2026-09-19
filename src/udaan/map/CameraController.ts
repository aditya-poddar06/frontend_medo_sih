import * as Cesium from 'cesium';

export const INDIA_CENTER = {
  lon: 78.9629,
  lat: 22.5937,
  height: 3_650_000,
};

export function flyToIndia(viewer: Cesium.Viewer, duration = 1.6): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      INDIA_CENTER.lon,
      INDIA_CENTER.lat,
      INDIA_CENTER.height,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
    duration,
  });
}

export function setIndiaTopDown(viewer: Cesium.Viewer): void {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      INDIA_CENTER.lon,
      INDIA_CENTER.lat,
      INDIA_CENTER.height,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
}

export function flyToAirport(
  viewer: Cesium.Viewer,
  lon: number,
  lat: number,
  height = 900_000,
): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-85),
      roll: 0,
    },
    duration: 1.2,
  });
}

/**
 * Fly the camera to frame a route between two airports with enough context.
 */
export function flyToRoute(
  viewer: Cesium.Viewer,
  originLon: number,
  originLat: number,
  destLon: number,
  destLat: number,
): void {
  const centerLon = (originLon + destLon) / 2;
  const centerLat = (originLat + destLat) / 2;
  // Estimate height from the distance between airports
  const latSpan = Math.abs(originLat - destLat);
  const lonSpan = Math.abs(originLon - destLon);
  const maxSpan = Math.max(latSpan, lonSpan);
  // Scale height so the route fits comfortably: ~110km per degree, aim for padding
  const height = Math.max(600_000, Math.min(3_200_000, maxSpan * 130_000));

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, height),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
    duration: 1.4,
  });
}

/** Smoothly return to India overview. */
export function flyBackToIndia(viewer: Cesium.Viewer): void {
  flyToIndia(viewer, 1.2);
}

