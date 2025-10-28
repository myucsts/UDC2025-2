import type { CoolingShelter, GeoPoint } from '../types';

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const distanceInMeters = (a: GeoPoint, b: GeoPoint): number => {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);

  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(EARTH_RADIUS_METERS * c);
};

export const formatDistance = (meters: number | undefined): string => {
  if (meters === undefined || Number.isNaN(meters)) return '-';
  if (meters < 1000) {
    return `${meters.toLocaleString('ja-JP')} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
};

export type TravelMode = 'walk' | 'drive';

export const estimateDurationSeconds = (
  meters: number,
  mode: TravelMode,
): number => {
  const speed =
    mode === 'walk' ? 1.2 /* m/s ≈ 4.3 km/h */ : 10.0 /* m/s ≈ 36 km/h */;
  return meters / speed;
};

export const formatDuration = (seconds: number | undefined): string => {
  if (!seconds || Number.isNaN(seconds)) return '-';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}時間${restMinutes}分`;
};

export const findNearestShelter = (
  shelters: CoolingShelter[],
  point: GeoPoint,
): { shelter: CoolingShelter; distanceMeters: number } | undefined => {
  let best: { shelter: CoolingShelter; distanceMeters: number } | undefined;

  for (const shelter of shelters) {
    const distanceMeters = distanceInMeters(point, {
      latitude: shelter.latitude,
      longitude: shelter.longitude,
    });
    if (!best || distanceMeters < best.distanceMeters) {
      best = { shelter, distanceMeters };
    }
  }

  return best;
};
