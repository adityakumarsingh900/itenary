import { CellData } from '../types';

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

export const DEMO_TRAVEL_PLACES: PlaceSearchResult[] = [
  {
    text: 'Eiffel Tower',
    address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris, France',
    photoUrl: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-eiffel-tower',
    location: { lat: 48.8584, lng: 2.2945 },
    isDemo: true
  },
  {
    text: 'Colosseum',
    address: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
    photoUrl: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-colosseum',
    location: { lat: 41.8902, lng: 12.4922 },
    isDemo: true
  },
  {
    text: 'Shibuya Crossing',
    address: 'Shibuya City, Tokyo 150-0043, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-shibuya',
    location: { lat: 35.6595, lng: 139.7005 },
    isDemo: true
  },
  {
    text: 'Sagrada Família',
    address: 'C/ de Mallorca, 401, 08013 Barcelona, Spain',
    photoUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-sagrada',
    location: { lat: 41.4036, lng: 2.1744 },
    isDemo: true
  },
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
    text: 'Uluwatu Temple',
    address: 'Pecatu, South Kuta, Badung Regency, Bali 80361, Indonesia',
    photoUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-uluwatu',
    location: { lat: -8.8291, lng: 115.0849 },
    isDemo: true
  },
  {
    text: 'Big Ben',
    address: 'London SW1A 0AA, United Kingdom',
    photoUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-big-ben',
    location: { lat: 51.5007, lng: -0.1246 },
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
    text: 'Machu Picchu',
    address: 'Cusco Region, Urubamba Province, Peru',
    photoUrl: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-machu-picchu',
    location: { lat: -13.1631, lng: -72.545 },
    isDemo: true
  },
  {
    text: 'Grand Canyon National Park',
    address: 'Arizona, United States',
    photoUrl: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-grand-canyon',
    location: { lat: 36.1069, lng: -112.1129 },
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
    text: 'Central Park',
    address: 'New York, NY, United States',
    photoUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-central-park',
    location: { lat: 40.785091, lng: -73.968285 },
    isDemo: true
  },
  {
    text: 'Mount Fuji',
    address: 'Kitayama, Fujinomiya, Shizuoka 418-0112, Japan',
    photoUrl: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=640&q=80',
    placeId: 'demo-mount-fuji',
    location: { lat: 35.3606, lng: 138.7274 },
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

export function searchDemoPlaces(query: string): PlaceSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return DEMO_TRAVEL_PLACES.slice(0, 6);
  }

  const matches = DEMO_TRAVEL_PLACES.filter(
    (item) => item.text.toLowerCase().includes(trimmed) || (item.address && item.address.toLowerCase().includes(trimmed))
  );

  if (matches.length > 0) {
    return matches;
  }

  // If no match found in preset demo list, return a custom entry with a travel photo fallback
  return [
    {
      text: query.trim(),
      address: 'Custom destination or address',
      photoUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=640&q=80',
      placeId: `custom-${Date.now()}`,
      isDemo: true
    }
  ];
}

export function extractGooglePlaceData(place: any): CellData {
  const text = place.name || place.formatted_address || '';
  const address = place.formatted_address || '';
  let photoUrl: string | undefined = undefined;

  if (place.photos && place.photos.length > 0) {
    try {
      photoUrl = place.photos[0].getUrl({ maxWidth: 640, maxHeight: 400 });
    } catch (e) {
      console.warn('Could not extract photo URL from Google Place:', e);
    }
  }

  let location: { lat: number; lng: number } | undefined = undefined;
  if (place.geometry?.location) {
    try {
      location = {
        lat: typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat,
        lng: typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng
      };
    } catch {
      // ignore
    }
  }

  return {
    text,
    photoUrl,
    address,
    placeId: place.place_id,
    location
  };
}
