import { useEffect, useRef, useState } from 'react';
import { CellData, CellType, DestinationData } from '../types';
import {
  extractGooglePlaceData,
  geocodeDestination,
  isGoogleMapsConfigured,
  isGoogleMapsLoaded,
  loadGooglePlacesScript,
  PlaceSearchResult,
  searchDemoPlaces
} from '../utils/googlePlaces';

interface PlaceSearchModalContentProps {
  cellType: CellType;
  initialData: CellData;
  onChange: (data: CellData) => void;
  onSave: () => void;
  onCancel: () => void;
  destination?: string;
  destinationData?: DestinationData;
}

export function PlaceSearchModalContent({
  cellType,
  initialData,
  onChange,
  onSave,
  onCancel,
  destination,
  destinationData
}: PlaceSearchModalContentProps) {
  const [googleConfigured] = useState(() => isGoogleMapsConfigured());
  const [googleReady, setGoogleReady] = useState(() => isGoogleMapsLoaded());
  const [googleLoading, setGoogleLoading] = useState(() => isGoogleMapsConfigured() && !isGoogleMapsLoaded());
  const [resolvedDestData, setResolvedDestData] = useState<DestinationData | undefined>(destinationData);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentData, setCurrentData] = useState<CellData>(initialData);
  const [isCustomMode, setIsCustomMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const googleContainerRef = useRef<HTMLDivElement>(null);
  const autocompleteElementRef = useRef<any>(null);

  // If destination is provided but destinationData lacks coordinates, resolve them via geocoding
  useEffect(() => {
    if (destinationData?.location) {
      setResolvedDestData(destinationData);
      return;
    }

    if (destination && destination.trim()) {
      let isMounted = true;
      geocodeDestination(destination).then((geo) => {
        if (isMounted && geo) {
          setResolvedDestData(geo);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [destination, destinationData]);

  // Initialize Google Maps script if configured and not yet ready
  useEffect(() => {
    let isMounted = true;

    if (googleConfigured && !googleReady) {
      setGoogleLoading(true);
      loadGooglePlacesScript().then((ready) => {
        if (isMounted) {
          setGoogleReady(ready);
          setGoogleLoading(false);
        }
      });
    } else if (googleReady) {
      setGoogleLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [googleConfigured, googleReady]);

  // Setup modern PlaceAutocompleteElement from Places API (New) with destination locationBias
  useEffect(() => {
    if (!googleReady || !window.google?.maps || !googleContainerRef.current) {
      return;
    }

    let isSubscribed = true;

    async function initModernAutocomplete() {
      try {
        const placesLib = await window.google.maps.importLibrary('places');
        if (!isSubscribed || !googleContainerRef.current) {
          return;
        }

        const { PlaceAutocompleteElement } = placesLib;
        if (PlaceAutocompleteElement) {
          const currentDest = destinationData || resolvedDestData;
          let locationBias: any = undefined;
          if (currentDest?.viewport) {
            locationBias = currentDest.viewport;
          } else if (currentDest?.location) {
            locationBias = {
              center: currentDest.location,
              radius: 50000 // 50km radius bias
            };
          }

          const element = new PlaceAutocompleteElement(locationBias ? { locationBias } : undefined);
          if (locationBias) {
            try {
              element.locationBias = locationBias;
            } catch {
              // ignore
            }
          }

          const shortDest = destination ? destination.split(',')[0].trim() : '';
          element.placeholder = shortDest
            ? `Search ${cellType === 'place' ? 'places' : 'points & landmarks'} in ${shortDest}...`
            : cellType === 'place'
            ? 'Search place or address...'
            : 'Search point or landmark...';

          autocompleteElementRef.current = element;
          googleContainerRef.current.innerHTML = '';
          googleContainerRef.current.appendChild(element);

          const handleSelect = async (event: any) => {
            try {
              let place = event.place;
              if (!place && event.placePrediction) {
                place = event.placePrediction.toPlace();
              }
              if (!place) {
                return;
              }

              await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location', 'photos', 'id']
              });

              const text = place.displayName || place.formattedAddress || '';
              const address = place.formattedAddress || '';
              let photoUrl: string | undefined = undefined;

              if (place.photos && place.photos.length > 0) {
                const photo = place.photos[0];
                if (typeof photo.getURI === 'function') {
                  photoUrl = photo.getURI({ maxWidth: 640, maxHeight: 400 });
                } else if (typeof photo.getUrl === 'function') {
                  photoUrl = photo.getUrl({ maxWidth: 640, maxHeight: 400 });
                }
              }

              let location: { lat: number; lng: number } | undefined = undefined;
              if (place.location) {
                location = {
                  lat: typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat,
                  lng: typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng
                };
              }

              const extracted: CellData = {
                text,
                photoUrl,
                address,
                placeId: place.id,
                location
              };

              setCurrentData(extracted);
              onChange(extracted);
            } catch (err) {
              console.error('Error fetching place fields:', err);
            }
          };

          element.addEventListener('gmp-placeselect', handleSelect);
          element.addEventListener('gmp-select', handleSelect);
        }
      } catch (err) {
        console.warn('PlaceAutocompleteElement initialization error:', err);
      }
    }

    initModernAutocomplete();

    return () => {
      isSubscribed = false;
      autocompleteElementRef.current = null;
    };
  }, [googleReady, cellType]);

  // Dynamically update locationBias if destination coordinates resolve later
  useEffect(() => {
    if (!autocompleteElementRef.current) return;
    const currentDest = destinationData || resolvedDestData;
    let locationBias: any = undefined;
    if (currentDest?.viewport) {
      locationBias = currentDest.viewport;
    } else if (currentDest?.location) {
      locationBias = {
        center: currentDest.location,
        radius: 50000
      };
    }

    if (locationBias) {
      try {
        autocompleteElementRef.current.locationBias = locationBias;
      } catch {
        // ignore
      }
    }
  }, [destinationData, resolvedDestData]);

  // Update suggestions for demo/fallback mode when query or destination changes
  useEffect(() => {
    if (googleReady) {
      return;
    }

    const results = searchDemoPlaces(searchQuery, destination);
    setSuggestions(results);
  }, [searchQuery, destination, googleReady]);

  const handleSelectSuggestion = (place: PlaceSearchResult) => {
    const updated: CellData = {
      text: place.text,
      address: place.address,
      photoUrl: place.photoUrl,
      placeId: place.placeId,
      location: place.location
    };
    setCurrentData(updated);
    onChange(updated);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleManualTextChange = (text: string) => {
    const updated: CellData = {
      ...currentData,
      text
    };
    setCurrentData(updated);
    onChange(updated);
  };

  const handleRemovePhoto = () => {
    const updated: CellData = {
      ...currentData,
      photoUrl: undefined
    };
    setCurrentData(updated);
    onChange(updated);
  };

  const handleCustomPhotoUrlChange = (url: string) => {
    const updated: CellData = {
      ...currentData,
      photoUrl: url.trim() || undefined
    };
    setCurrentData(updated);
    onChange(updated);
  };

  const shortDestinationName = destination ? destination.split(',')[0].trim() : '';

  return (
    <div className="place-search-container">
      {/* Search Input Section */}
      <div className="place-search-field-wrap">
        <label className="place-search-label">
          <div className="place-search-label-text">
            <span>Search {cellType === 'place' ? 'place or address' : 'point or landmark'}</span>
            {destination ? (
              <span className="places-destination-badge" title={`Search is focused in and around ${destination}`}>
                <span className="places-destination-pin">📍</span> {destination}
              </span>
            ) : null}
          </div>
          {googleReady ? (
            <span className="places-status-tag places-status-tag--google">Google Places 🌐</span>
          ) : googleLoading ? (
            <span className="places-status-tag places-status-tag--loading">Connecting... ⏳</span>
          ) : (
            <span className="places-status-tag places-status-tag--demo" title="Add VITE_GOOGLE_MAPS_API_KEY in .env for live worldwide Google search">
              Demo search active 📍
            </span>
          )}
        </label>

        {googleReady ? (
          <div className="google-places-new-wrapper">
            <div ref={googleContainerRef} className="google-places-new-slot" />
          </div>
        ) : googleLoading ? (
          <div className="place-search-input-box">
            <svg
              className="place-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              className="place-search-input place-search-input--loading"
              disabled
              placeholder="Connecting to Google Places..."
            />
          </div>
        ) : (
          <div className="place-search-input-box">
            <svg
              className="place-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              className="place-search-input"
              placeholder={
                shortDestinationName
                  ? `Search in ${shortDestinationName} (e.g. attractions, cafes)...`
                  : 'Search place (e.g. Shibuya, Colosseum, Taj Mahal)...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    const first = suggestions[0];
                    if (first) {
                      handleSelectSuggestion(first);
                    } else {
                      handleSelectSuggestion({
                        text: searchQuery.trim(),
                        address: destination ? `Place in ${destination}` : 'Custom destination',
                        photoUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=640&q=80',
                        placeId: `custom-${Date.now()}`
                      });
                    }
                  }
                }
              }}
            />

            {searchQuery ? (
              <button
                type="button"
                className="place-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  if (inputRef.current) inputRef.current.focus();
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
        )}

        {/* Demo suggestions dropdown (active when Google API is not loaded or during demo mode) */}
        {!googleReady && !googleLoading && showSuggestions && suggestions.length > 0 ? (
          <div className="places-suggestions-dropdown">
            <div className="places-suggestions-header">
              {shortDestinationName
                ? `Places in & around ${shortDestinationName}`
                : 'Popular destinations & suggestions'}
            </div>
            {suggestions.map((item) => (
              <button
                key={item.placeId || item.text}
                type="button"
                className="places-suggestion-item"
                onClick={() => handleSelectSuggestion(item)}
              >
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt="" className="places-suggestion-thumb" loading="lazy" />
                ) : (
                  <div className="places-suggestion-thumb-placeholder">📍</div>
                )}
                <div className="places-suggestion-info">
                  <strong className="places-suggestion-name">{item.text}</strong>
                  {item.address ? <span className="places-suggestion-addr">{item.address}</span> : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Selected Place Preview Card */}
      {currentData.text ? (
        <div className="place-preview-card">
          <div className="place-preview-header">
            <span className="place-preview-eyebrow">Selected for this cell</span>
            {currentData.photoUrl ? (
              <button
                type="button"
                className="place-preview-remove-photo-btn"
                onClick={handleRemovePhoto}
                title="Remove photo from cell"
              >
                Remove photo
              </button>
            ) : null}
          </div>

          <div className="place-preview-body">
            {currentData.photoUrl ? (
              <div className="place-preview-photo-wrap">
                <img src={currentData.photoUrl} alt={currentData.text} className="place-preview-photo" />
              </div>
            ) : (
              <div className="place-preview-no-photo">
                <span>No photo selected</span>
              </div>
            )}

            <div className="place-preview-details">
              <label className="place-preview-label">
                Place name to show in cell
                <input
                  type="text"
                  className={`place-preview-name-input place-preview-name-input--${cellType}`}
                  value={currentData.text}
                  onChange={(e) => handleManualTextChange(e.target.value)}
                  placeholder="Enter place name"
                />
              </label>

              {currentData.address ? (
                <div className="place-preview-address">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{currentData.address}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="place-empty-selection">
          <div className="place-empty-icon">📍</div>
          <p>Search for a landmark, venue, or address above to add it with its picture.</p>
        </div>
      )}

      {/* Manual / Custom Text Toggle */}
      <div className="place-custom-toggle-wrap">
        <button
          type="button"
          className="place-custom-toggle-link"
          onClick={() => setIsCustomMode(!isCustomMode)}
        >
          {isCustomMode ? 'Hide advanced options ▲' : 'Custom photo URL or text only ▼'}
        </button>

        {isCustomMode ? (
          <div className="place-custom-fields">
            <label>
              Custom Photo URL (optional)
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={currentData.photoUrl || ''}
                onChange={(e) => handleCustomPhotoUrlChange(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>

      {/* Modal Actions */}
      <div className="cell-modal-actions">
        <button
          className="primary-button"
          type="button"
          onClick={onSave}
          disabled={!currentData.text.trim()}
        >
          Save
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
