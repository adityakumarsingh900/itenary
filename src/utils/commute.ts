import { CellData, CellValue, CommuteMode, getCellAddress, getCellLocation, getCellText } from '../types';

export type CommuteEstimate = {
  durationText: string;
  distanceText: string;
  durationSeconds: number;
  mode: CommuteMode;
  isEstimate: boolean;
};

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function formatDuration(totalMinutes: number): string {
  const mins = Math.max(1, Math.round(totalMinutes));
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  return `${hours} hr ${remainingMins} mins`;
}

export function getCommuteModeEmoji(mode: CommuteMode): string {
  switch (mode) {
    case 'TRANSIT':
      return '🚌';
    case 'WALKING':
      return '🚶';
    case 'BICYCLING':
      return '🚲';
    case 'DRIVING':
    default:
      return '🚗';
  }
}

export function getCommuteModeLabel(mode: CommuteMode): string {
  switch (mode) {
    case 'TRANSIT':
      return 'Transit';
    case 'WALKING':
      return 'Walk';
    case 'BICYCLING':
      return 'Bike';
    case 'DRIVING':
    default:
      return 'Drive';
  }
}

export function estimateCommuteFallback(
  originLoc: { lat: number; lng: number },
  destLoc: { lat: number; lng: number },
  mode: CommuteMode = 'DRIVING'
): CommuteEstimate {
  const straightLineKm = haversineDistanceKm(originLoc.lat, originLoc.lng, destLoc.lat, destLoc.lng);
  // Real road/walking distance is roughly 1.3x straight-line in cities
  const roadDistanceKm = Math.max(0.1, straightLineKm * 1.3);

  let speedKmH = 30; // Driving average in city
  let overheadMins = 3;

  if (mode === 'WALKING') {
    speedKmH = 4.8;
    overheadMins = 0;
  } else if (mode === 'TRANSIT') {
    speedKmH = 22;
    overheadMins = 6;
  } else if (mode === 'BICYCLING') {
    speedKmH = 15;
    overheadMins = 2;
  }

  const travelMins = (roadDistanceKm / speedKmH) * 60 + overheadMins;
  const roundedMins = Math.max(mode === 'WALKING' ? 2 : 5, Math.round(travelMins));

  return {
    durationText: formatDuration(roundedMins),
    distanceText: formatDistance(roadDistanceKm),
    durationSeconds: roundedMins * 60,
    mode,
    isEstimate: true
  };
}

/**
 * Calculates commute time between two cell values using Google Maps Distance Matrix
 * or falling back to coordinate-based estimation.
 */
export async function calculateCommute(
  origin: CellValue,
  destination: CellValue,
  mode: CommuteMode = 'DRIVING'
): Promise<CommuteEstimate | null> {
  const originLoc = getCellLocation(origin);
  const destLoc = getCellLocation(destination);
  const originAddr = getCellAddress(origin) || getCellText(origin);
  const destAddr = getCellAddress(destination) || getCellText(destination);

  // Try Google Maps Distance Matrix if available
  if (typeof window !== 'undefined' && window.google?.maps?.DistanceMatrixService) {
    try {
      const service = new window.google.maps.DistanceMatrixService();
      const originParam = originLoc
        ? new window.google.maps.LatLng(originLoc.lat, originLoc.lng)
        : originAddr;
      const destParam = destLoc
        ? new window.google.maps.LatLng(destLoc.lat, destLoc.lng)
        : destAddr;

      if (originParam && destParam) {
        const googleMode = window.google.maps.TravelMode[mode] || window.google.maps.TravelMode.DRIVING;

        const result = await new Promise<CommuteEstimate | null>((resolve) => {
          service.getDistanceMatrix(
            {
              origins: [originParam],
              destinations: [destParam],
              travelMode: googleMode
            },
            (response: any, status: string) => {
              if (status === 'OK' && response?.rows?.[0]?.elements?.[0]?.status === 'OK') {
                const element = response.rows[0].elements[0];
                resolve({
                  durationText: element.duration.text,
                  distanceText: element.distance.text,
                  durationSeconds: element.duration.value,
                  mode,
                  isEstimate: false
                });
              } else {
                resolve(null);
              }
            }
          );
        });

        if (result) {
          return result;
        }
      }
    } catch (err) {
      console.warn('Google DistanceMatrixService error:', err);
    }
  }

  // Fallback to Haversine estimate if coordinates exist
  if (originLoc && destLoc) {
    return estimateCommuteFallback(originLoc, destLoc, mode);
  }

  return null;
}
