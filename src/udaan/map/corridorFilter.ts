/**
 * Geographic corridor filter for live flight tracking.
 *
 * Determines whether an aircraft is within a configurable radius
 * of the great-circle path between two airports.
 */

/** Corridor radius in km — default 80 km on each side of the route centerline. */
export const LIVE_FLIGHT_CORRIDOR_RADIUS_KM = 80;

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

/** Haversine distance between two geographic points in km. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Cross-track distance: perpendicular distance from a point to the
 * great-circle defined by two endpoints, in km.
 *
 * Uses the formula: d_xt = asin(sin(d13/R) * sin(θ13 - θ12)) * R
 * where d13 is distance from start to point, θ13 is bearing from start to point,
 * and θ12 is bearing from start to end.
 */
function crossTrackDistanceKm(
  pointLat: number,
  pointLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): number {
  const d13 = haversineKm(startLat, startLon, pointLat, pointLon) / EARTH_RADIUS_KM;
  const θ13 = bearingRad(startLat, startLon, pointLat, pointLon);
  const θ12 = bearingRad(startLat, startLon, endLat, endLon);
  const dXt = Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * EARTH_RADIUS_KM;
  return Math.abs(dXt);
}

/** Along-track distance from start to the closest point on the great-circle to the point. */
function alongTrackDistanceKm(
  pointLat: number,
  pointLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): number {
  const d13 = haversineKm(startLat, startLon, pointLat, pointLon) / EARTH_RADIUS_KM;
  const dXt = crossTrackDistanceKm(pointLat, pointLon, startLat, startLon, endLat, endLon) / EARTH_RADIUS_KM;
  return Math.acos(Math.cos(d13) / Math.cos(dXt)) * EARTH_RADIUS_KM;
}

/** Initial bearing in radians from (lat1,lon1) to (lat2,lon2). */
function bearingRad(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

/**
 * Determines if an aircraft position lies within the corridor of a route.
 *
 * The corridor is the area within `radiusKm` of the great-circle segment
 * between origin and destination. Aircraft beyond the endpoints (but still
 * close to the extended great-circle line) are excluded.
 */
export function isInCorridor(
  aircraftLat: number,
  aircraftLon: number,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  radiusKm: number = LIVE_FLIGHT_CORRIDOR_RADIUS_KM,
): boolean {
  // Cross-track distance: how far from the great-circle line
  const xtDist = crossTrackDistanceKm(
    aircraftLat, aircraftLon,
    originLat, originLon,
    destLat, destLon,
  );
  if (xtDist > radiusKm) return false;

  // Along-track distance: ensure the aircraft is between the endpoints
  // (with some padding equal to the radius)
  const routeLength = haversineKm(originLat, originLon, destLat, destLon);
  const atDist = alongTrackDistanceKm(
    aircraftLat, aircraftLon,
    originLat, originLon,
    destLat, destLon,
  );

  // Allow some overshoot near airports (up to radiusKm past each endpoint)
  return atDist >= -radiusKm && atDist <= routeLength + radiusKm;
}
