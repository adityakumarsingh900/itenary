import { CellData, DestinationData } from '../types';

declare global {
  interface Window {
    google?: any;
    __googleMapsLoadingPromise?: Promise<boolean>;
  }
}

export const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

export function isGoogleMapsConfigured(): boolean {
  return Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim().length > 0 && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY');
}

export function isGoogleMapsLoaded(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    window.google?.maps &&
    (window.google.maps.places || window.google.maps.importLibrary)
  );
}

/**
 * Dynamically loads the Google Maps JavaScript API with Places library.
 */
export function loadGooglePlacesScript(apiKey: string = GOOGLE_MAPS_API_KEY): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(true);
  }

  if (window.google?.maps?.importLibrary) {
    return window.google.maps
      .importLibrary('places')
      .then(() => true)
      .catch((err: any) => {
        console.warn('Failed to import Google places library:', err);
        return Boolean(window.google?.maps?.places);
      });
  }

  if (window.__googleMapsLoadingPromise) {
    return window.__googleMapsLoadingPromise;
  }

  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_API_KEY') {
    return Promise.resolve(false);
  }

  window.__googleMapsLoadingPromise = new Promise((resolve) => {
    const handleScriptLoaded = async () => {
      try {
        if (window.google?.maps?.importLibrary) {
          await window.google.maps.importLibrary('places');
          resolve(true);
          return;
        }

        if (window.google?.maps?.places) {
          resolve(true);
          return;
        }

        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          if (window.google?.maps?.importLibrary) {
            clearInterval(interval);
            try {
              await window.google.maps.importLibrary('places');
              resolve(true);
            } catch {
              resolve(Boolean(window.google?.maps?.places));
            }
          } else if (window.google?.maps?.places) {
            clearInterval(interval);
            resolve(true);
          } else if (attempts >= 20) {
            clearInterval(interval);
            resolve(false);
          }
        }, 50);
      } catch (err) {
        console.warn('Error during Google Maps places initialization:', err);
        resolve(Boolean(window.google?.maps?.places));
      }
    };

    // Check if script already exists in DOM
    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps?.places || window.google?.maps?.importLibrary) {
        handleScriptLoaded();
        return;
      }
      existing.addEventListener('load', handleScriptLoaded);
      existing.addEventListener('error', () => {
        delete window.__googleMapsLoadingPromise;
        resolve(false);
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.type = 'text/javascript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = handleScriptLoaded;

    script.onerror = () => {
      console.warn('Google Maps script failed to load. Falling back to travel database.');
      delete window.__googleMapsLoadingPromise;
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return window.__googleMapsLoadingPromise;
}

export type PlaceSearchResult = {
  text: string;
  photoUrl?: string;
  address?: string;
  placeId?: string;
  location?: { lat: number; lng: number };
  isDemo?: boolean;
};

export const DEMO_DESTINATIONS: DestinationData[] = [
  {
    name: 'Paris, France',
    formattedAddress: 'Paris, France',
    location: { lat: 48.8566, lng: 2.3522 },
    viewport: { north: 48.9021, south: 48.8155, east: 2.4699, west: 2.2241 },
    photoUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-paris'
  },
  {
    name: 'Tokyo, Japan',
    formattedAddress: 'Tokyo, Japan',
    location: { lat: 35.6762, lng: 139.6503 },
    viewport: { north: 35.8984, south: 35.5012, east: 139.919, west: 138.9428 },
    photoUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-tokyo'
  },
  {
    name: 'Bali, Indonesia',
    formattedAddress: 'Bali, Indonesia',
    location: { lat: -8.409518, lng: 115.188916 },
    viewport: { north: -8.0, south: -8.9, east: 115.8, west: 114.4 },
    photoUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-bali'
  },
  {
    name: 'Rome, Italy',
    formattedAddress: 'Rome, Metropolitan City of Rome Capital, Italy',
    location: { lat: 41.9028, lng: 12.4964 },
    viewport: { north: 42.0, south: 41.8, east: 12.6, west: 12.3 },
    photoUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-rome'
  },
  {
    name: 'New York, USA',
    formattedAddress: 'New York, NY, USA',
    location: { lat: 40.7128, lng: -74.006 },
    viewport: { north: 40.9175, south: 40.4773, east: -73.7002, west: -74.259 },
    photoUrl: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-nyc'
  },
  {
    name: 'London, United Kingdom',
    formattedAddress: 'London, UK',
    location: { lat: 51.5074, lng: -0.1278 },
    viewport: { north: 51.6723, south: 51.3849, east: 0.1482, west: -0.3514 },
    photoUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-london'
  },
  {
    name: 'Barcelona, Spain',
    formattedAddress: 'Barcelona, Spain',
    location: { lat: 41.3879, lng: 2.1699 },
    viewport: { north: 41.4695, south: 41.32, east: 2.228, west: 2.0695 },
    photoUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-barcelona'
  },
  {
    name: 'Sydney, Australia',
    formattedAddress: 'Sydney NSW, Australia',
    location: { lat: -33.8688, lng: 151.2093 },
    viewport: { north: -33.5, south: -34.1, east: 151.3, west: 150.9 },
    photoUrl: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-sydney'
  },
  {
    name: 'Kyoto, Japan',
    formattedAddress: 'Kyoto, Japan',
    location: { lat: 35.0116, lng: 135.7681 },
    viewport: { north: 35.1, south: 34.9, east: 135.9, west: 135.6 },
    photoUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-kyoto'
  },
  {
    name: 'Santorini, Greece',
    formattedAddress: 'Santorini, Thira, Greece',
    location: { lat: 36.3932, lng: 25.4615 },
    viewport: { north: 36.48, south: 36.32, east: 25.5, west: 25.35 },
    photoUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-santorini'
  },
  {
    name: 'Singapore',
    formattedAddress: 'Singapore',
    location: { lat: 1.3521, lng: 103.8198 },
    viewport: { north: 1.47, south: 1.2, east: 104.05, west: 103.6 },
    photoUrl: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-singapore'
  },
  {
    name: 'Dubai, UAE',
    formattedAddress: 'Dubai, United Arab Emirates',
    location: { lat: 25.2048, lng: 55.2708 },
    viewport: { north: 25.35, south: 24.95, east: 55.55, west: 55.05 },
    photoUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-dubai'
  }
];

export function searchDemoDestinations(query: string): DestinationData[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return DEMO_DESTINATIONS;
  }

  const matches = DEMO_DESTINATIONS.filter(
    (item) =>
      item.name.toLowerCase().includes(trimmed) ||
      (item.formattedAddress && item.formattedAddress.toLowerCase().includes(trimmed))
  );

  if (matches.length > 0) {
    return matches;
  }

  return [
    {
      name: query.trim(),
      formattedAddress: `${query.trim()} (Custom destination)`,
      photoUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80',
      placeId: `custom-dest-${Date.now()}`
    }
  ];
}

export async function geocodeDestination(destinationName: string): Promise<DestinationData | null> {
  if (!destinationName || !destinationName.trim()) {
    return null;
  }

  const norm = destinationName.trim().toLowerCase();
  const demoMatch = DEMO_DESTINATIONS.find(
    (d) =>
      d.name.toLowerCase().includes(norm) ||
      norm.includes(d.name.toLowerCase().split(',')[0].trim()) ||
      (d.formattedAddress && d.formattedAddress.toLowerCase().includes(norm))
  );

  if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
    try {
      const geocoder = new window.google.maps.Geocoder();
      const response = await geocoder.geocode({ address: destinationName });
      if (response && response.results && response.results.length > 0) {
        const result = response.results[0];
        const loc = result.geometry.location;
        const vp = result.geometry.viewport;
        return {
          name: destinationName,
          formattedAddress: result.formatted_address,
          placeId: result.place_id,
          location: {
            lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
            lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng
          },
          viewport: vp
            ? {
                north: typeof vp.getNorthEast === 'function' ? vp.getNorthEast().lat() : vp.north,
                east: typeof vp.getNorthEast === 'function' ? vp.getNorthEast().lng() : vp.east,
                south: typeof vp.getSouthWest === 'function' ? vp.getSouthWest().lat() : vp.south,
                west: typeof vp.getSouthWest === 'function' ? vp.getSouthWest().lng() : vp.west
              }
            : undefined,
          photoUrl: demoMatch?.photoUrl
        };
      }
    } catch (err) {
      console.warn('Geocoding destination error:', err);
    }
  }

  return demoMatch || null;
}

export function extractGoogleDestinationData(place: any): DestinationData {
  const name =
    place.displayName ||
    place.name ||
    place.formattedAddress ||
    place.formatted_address ||
    '';
  const formattedAddress = place.formattedAddress || place.formatted_address || '';
  let photoUrl: string | undefined = undefined;

  if (place.photos && place.photos.length > 0) {
    try {
      const photo = place.photos[0];
      if (typeof photo.getURI === 'function') {
        photoUrl = photo.getURI({ maxWidth: 800, maxHeight: 500 });
      } else if (typeof photo.getUrl === 'function') {
        photoUrl = photo.getUrl({ maxWidth: 800, maxHeight: 500 });
      }
    } catch (e) {
      console.warn('Could not extract photo URL:', e);
    }
  }

  let location: { lat: number; lng: number } | undefined = undefined;
  const rawLoc = place.location || place.geometry?.location;
  if (rawLoc) {
    try {
      location = {
        lat: typeof rawLoc.lat === 'function' ? rawLoc.lat() : rawLoc.lat,
        lng: typeof rawLoc.lng === 'function' ? rawLoc.lng() : rawLoc.lng
      };
    } catch {
      // ignore
    }
  }

  let viewport: { north: number; south: number; east: number; west: number } | undefined = undefined;
  const rawVp = place.viewport || place.geometry?.viewport;
  if (rawVp) {
    try {
      viewport = {
        north: typeof rawVp.getNorthEast === 'function' ? rawVp.getNorthEast().lat() : rawVp.north,
        east: typeof rawVp.getNorthEast === 'function' ? rawVp.getNorthEast().lng() : rawVp.east,
        south: typeof rawVp.getSouthWest === 'function' ? rawVp.getSouthWest().lat() : rawVp.south,
        west: typeof rawVp.getSouthWest === 'function' ? rawVp.getSouthWest().lng() : rawVp.west
      };
    } catch {
      // ignore
    }
  }

  return {
    name,
    formattedAddress,
    placeId: place.id || place.place_id,
    location,
    viewport,
    photoUrl
  };
}

export const DEMO_TRAVEL_PLACES: PlaceSearchResult[] = [
  // Paris places
  {
    text: 'Eiffel Tower',
    address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris, France',
    photoUrl: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-eiffel-tower',
    location: { lat: 48.8584, lng: 2.2945 },
    isDemo: true
  },
  {
    text: 'Louvre Museum',
    address: '75001 Paris, France',
    photoUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-louvre',
    location: { lat: 48.8606, lng: 2.3376 },
    isDemo: true
  },
  {
    text: 'Arc de Triomphe',
    address: 'Pl. Charles de Gaulle, 75008 Paris, France',
    photoUrl: 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-arc-triomphe',
    location: { lat: 48.8738, lng: 2.295 },
    isDemo: true
  },
  {
    text: 'Cathédrale Notre-Dame de Paris',
    address: '6 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris, France',
    photoUrl: 'https://images.unsplash.com/photo-1543349689-9a4d426bee8e?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-notre-dame',
    location: { lat: 48.853, lng: 2.3499 },
    isDemo: true
  },

  // Tokyo places
  {
    text: 'Shibuya Crossing',
    address: 'Shibuya City, Tokyo 150-0043, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-shibuya',
    location: { lat: 35.6595, lng: 139.7005 },
    isDemo: true
  },
  {
    text: 'Senso-ji Temple',
    address: '2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-sensoji',
    location: { lat: 35.7148, lng: 139.7967 },
    isDemo: true
  },
  {
    text: 'Tokyo Skytree',
    address: '1 Chome-1-2 Oshiage, Sumida City, Tokyo 131-0045, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-skytree',
    location: { lat: 35.71, lng: 139.8107 },
    isDemo: true
  },
  {
    text: 'Meiji Jingu Shrine',
    address: '1-1 Yoyogikamizonacho, Shibuya City, Tokyo 151-8557, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-meiji-jingu',
    location: { lat: 35.6764, lng: 139.6993 },
    isDemo: true
  },

  // Bali places
  {
    text: 'Uluwatu Temple',
    address: 'Pecatu, South Kuta, Badung Regency, Bali 80361, Indonesia',
    photoUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-uluwatu',
    location: { lat: -8.8291, lng: 115.0849 },
    isDemo: true
  },
  {
    text: 'Tegallalang Rice Terrace',
    address: 'Jl. Raya Tegallalang, Ubud, Gianyar, Bali 80561, Indonesia',
    photoUrl: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-tegallalang',
    location: { lat: -8.4334, lng: 115.2789 },
    isDemo: true
  },
  {
    text: 'Tanah Lot Temple',
    address: 'Beraban, Kediri, Tabanan Regency, Bali 82121, Indonesia',
    photoUrl: 'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-tanah-lot',
    location: { lat: -8.6212, lng: 115.0868 },
    isDemo: true
  },
  {
    text: 'Sacred Monkey Forest Sanctuary',
    address: 'Jl. Monkey Forest, Ubud, Kecamatan Ubud, Kabupaten Gianyar, Bali 80571, Indonesia',
    photoUrl: 'https://images.unsplash.com/photo-1578469550956-0e16b69c6a3d?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-monkey-forest',
    location: { lat: -8.5194, lng: 115.2606 },
    isDemo: true
  },

  // Rome places
  {
    text: 'Colosseum',
    address: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
    photoUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-colosseum',
    location: { lat: 41.8902, lng: 12.4922 },
    isDemo: true
  },
  {
    text: 'Trevi Fountain',
    address: 'Piazza di Trevi, 00187 Roma RM, Italy',
    photoUrl: 'https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-trevi',
    location: { lat: 41.9009, lng: 12.4833 },
    isDemo: true
  },
  {
    text: 'Pantheon',
    address: 'Piazza della Rotonda, 00186 Roma RM, Italy',
    photoUrl: 'https://images.unsplash.com/photo-1548560781-a7a07d9d33db?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-pantheon',
    location: { lat: 41.8986, lng: 12.4769 },
    isDemo: true
  },

  // New York places
  {
    text: 'Central Park',
    address: 'New York, NY, United States',
    photoUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-central-park',
    location: { lat: 40.785091, lng: -73.968285 },
    isDemo: true
  },
  {
    text: 'Empire State Building',
    address: '20 W 34th St., New York, NY 10001, United States',
    photoUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-empire-state',
    location: { lat: 40.7484, lng: -73.9857 },
    isDemo: true
  },
  {
    text: 'Times Square',
    address: 'Manhattan, NY 10036, United States',
    photoUrl: 'https://images.unsplash.com/photo-1508873696983-2df5703bc20d?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-times-square',
    location: { lat: 40.758, lng: -73.9855 },
    isDemo: true
  },

  // London places
  {
    text: 'Big Ben',
    address: 'London SW1A 0AA, United Kingdom',
    photoUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-big-ben',
    location: { lat: 51.5007, lng: -0.1246 },
    isDemo: true
  },
  {
    text: 'Tower Bridge',
    address: 'Tower Bridge Rd, London SE1 2UP, United Kingdom',
    photoUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-tower-bridge',
    location: { lat: 51.5055, lng: -0.0754 },
    isDemo: true
  },

  // Barcelona places
  {
    text: 'Sagrada Família',
    address: 'C/ de Mallorca, 401, 08013 Barcelona, Spain',
    photoUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-sagrada',
    location: { lat: 41.4036, lng: 2.1744 },
    isDemo: true
  },
  {
    text: 'Park Güell',
    address: '08024 Barcelona, Spain',
    photoUrl: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-park-guell',
    location: { lat: 41.4145, lng: 2.1527 },
    isDemo: true
  },

  // Other world landmarks
  {
    text: 'Taj Mahal',
    address: 'Dharmapuri, Forest Colony, Tajganj, Agra, Uttar Pradesh 282001, India',
    photoUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-taj-mahal',
    location: { lat: 27.1751, lng: 78.0421 },
    isDemo: true
  },
  {
    text: 'Santorini Caldera',
    address: 'Thira 847 00, Greece',
    photoUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-santorini',
    location: { lat: 36.4166, lng: 25.4316 },
    isDemo: true
  },
  {
    text: 'Sydney Opera House',
    address: 'Bennelong Point, Sydney NSW 2000, Australia',
    photoUrl: 'https://images.unsplash.com/photo-1624138784614-87fd1b6528f8?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-sydney-opera',
    location: { lat: -33.8568, lng: 151.2153 },
    isDemo: true
  },
  {
    text: 'Marina Bay Sands',
    address: '10 Bayfront Ave, Singapore 018956',
    photoUrl: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-marina-bay',
    location: { lat: 1.2838, lng: 103.8607 },
    isDemo: true
  },
  {
    text: 'Burj Khalifa',
    address: '1 Sheikh Mohammed bin Rashid Blvd - Downtown Dubai - Dubai - UAE',
    photoUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-burj-khalifa',
    location: { lat: 25.1972, lng: 55.2744 },
    isDemo: true
  },
  {
    text: 'Fushimi Inari Taisha',
    address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto 612-0882, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-fushimi',
    location: { lat: 34.9671, lng: 135.7727 },
    isDemo: true
  },
  {
    text: 'Amalfi Coast',
    address: 'Province of Salerno, Campania, Italy',
    photoUrl: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-amalfi',
    location: { lat: 40.634, lng: 14.6027 },
    isDemo: true
  },
  {
    text: 'Banff National Park',
    address: 'Improvement District No. 9, Alberta, Canada',
    photoUrl: 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-banff',
    location: { lat: 51.4968, lng: -115.9281 },
    isDemo: true
  }
];

export function searchDemoPlaces(query: string, destination?: string): PlaceSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  const destKeywords = destination
    ? destination
        .toLowerCase()
        .split(/[,\s]+/)
        .map((k) => k.trim())
        .filter((k) => k.length > 2)
    : [];

  const matchesDestination = (item: PlaceSearchResult): boolean => {
    if (destKeywords.length === 0) return true;
    const addr = (item.address || '').toLowerCase();
    const text = item.text.toLowerCase();
    return destKeywords.some((kw) => addr.includes(kw) || text.includes(kw));
  };

  // If query is empty: return places within destination first
  if (!trimmed) {
    if (destKeywords.length > 0) {
      const destMatches = DEMO_TRAVEL_PLACES.filter(matchesDestination);
      if (destMatches.length > 0) {
        return destMatches;
      }
    }
    return DEMO_TRAVEL_PLACES.slice(0, 6);
  }

  // Filter places that match the text query
  const queryMatches = DEMO_TRAVEL_PLACES.filter(
    (item) =>
      item.text.toLowerCase().includes(trimmed) ||
      (item.address && item.address.toLowerCase().includes(trimmed))
  );

  if (queryMatches.length > 0) {
    // If destination is specified, sort destination matches to the top
    if (destKeywords.length > 0) {
      return [...queryMatches].sort((a, b) => {
        const aInDest = matchesDestination(a) ? 1 : 0;
        const bInDest = matchesDestination(b) ? 1 : 0;
        return bInDest - aInDest;
      });
    }
    return queryMatches;
  }

  // If no match found in preset demo list, return a custom entry scoped to the destination
  return [
    {
      text: query.trim(),
      address: destination ? `Place in ${destination}` : 'Custom destination or address',
      photoUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=640&q=80',
      placeId: `custom-${Date.now()}`,
      isDemo: true
    }
  ];
}

export function extractGooglePlaceData(place: any): CellData {
  const text = place.displayName || place.name || place.formattedAddress || place.formatted_address || '';
  const address = place.formattedAddress || place.formatted_address || '';
  let photoUrl: string | undefined = undefined;

  if (place.photos && place.photos.length > 0) {
    try {
      const photo = place.photos[0];
      if (typeof photo.getURI === 'function') {
        photoUrl = photo.getURI({ maxWidth: 640, maxHeight: 400 });
      } else if (typeof photo.getUrl === 'function') {
        photoUrl = photo.getUrl({ maxWidth: 640, maxHeight: 400 });
      }
    } catch (e) {
      console.warn('Could not extract photo URL from Google Place:', e);
    }
  }

  let location: { lat: number; lng: number } | undefined = undefined;
  const rawLoc = place.location || place.geometry?.location;
  if (rawLoc) {
    try {
      location = {
        lat: typeof rawLoc.lat === 'function' ? rawLoc.lat() : rawLoc.lat,
        lng: typeof rawLoc.lng === 'function' ? rawLoc.lng() : rawLoc.lng
      };
    } catch {
      // ignore
    }
  }

  return {
    text,
    photoUrl,
    address,
    placeId: place.id || place.place_id,
    location
  };
}
