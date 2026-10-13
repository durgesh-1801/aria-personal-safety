/**
 * Real Geolocation Service for ARIA
 * Acquires genuine hardware GPS coordinates via HTML5 Geolocation.
 * Falls back to live GeoIP (network triangulation) if hardware GNSS is denied or unavailable.
 * Never invents hardcoded or fake coordinates.
 */

export interface GeoCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  source: 'gps' | 'geoip';
  city?: string;
  region?: string;
  country?: string;
}

let cachedCoords: GeoCoordinates | null = null;
let cachedTimestamp = 0;
const CACHE_TTL_MS = 15000; // 15 seconds cache

/**
 * Fetch real user location from network GeoIP service as a non-intrusive fallback
 */
export async function getRealGeoIPLocation(): Promise<GeoCoordinates | null> {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.latitude && data.longitude) {
      const coords: GeoCoordinates = {
        lat: parseFloat(data.latitude),
        lng: parseFloat(data.longitude),
        accuracy: data.accuracy ? parseFloat(data.accuracy) * 1000 : 5000,
        source: 'geoip',
        city: data.city,
        region: data.region,
        country: data.country
      };
      cachedCoords = coords;
      cachedTimestamp = Date.now();
      return coords;
    }
  } catch (err) {
    console.warn('[LOCATION] Real GeoIP lookup fallback failed:', err);
  }
  return null;
}

/**
 * Get real current coordinates.
 * Prioritizes high-accuracy hardware GPS, then falls back to real GeoIP.
 */
export async function getRealCoordinates(timeoutMs: number = 7000): Promise<GeoCoordinates | null> {
  // Return fresh cached coordinates if available
  if (cachedCoords && (Date.now() - cachedTimestamp < CACHE_TTL_MS)) {
    return cachedCoords;
  }

  // 1. Attempt hardware GPS first
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 10000
        });
      });

      const coords: GeoCoordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: 'gps'
      };

      cachedCoords = coords;
      cachedTimestamp = Date.now();
      return coords;
    } catch (gpsErr: any) {
      console.warn('[LOCATION] Hardware GPS acquisition notice:', gpsErr?.message || gpsErr);
    }
  }

  // 2. Hardware GPS failed or timed out — fallback to real GeoIP (actual user IP location)
  const geoIpCoords = await getRealGeoIPLocation();
  if (geoIpCoords) {
    return geoIpCoords;
  }

  return cachedCoords;
}

/**
 * Watch real-time GPS position with live updates.
 * Returns an unwatch cleanup function.
 */
export function watchRealCoordinates(
  onUpdate: (coords: GeoCoordinates) => void,
  onError?: (error: any) => void
): () => void {
  // Prime with immediate fix
  getRealCoordinates(5000).then((initial) => {
    if (initial) onUpdate(initial);
  });

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const coords: GeoCoordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        source: 'gps'
      };
      cachedCoords = coords;
      cachedTimestamp = Date.now();
      onUpdate(coords);
    },
    (err) => {
      if (onError) onError(err);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
