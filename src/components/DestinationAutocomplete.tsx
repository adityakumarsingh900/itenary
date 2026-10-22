import { useEffect, useRef, useState } from 'react';
import { DestinationData } from '../types';
import {
  extractGoogleDestinationData,
  isGoogleMapsConfigured,
  isGoogleMapsLoaded,
  loadGooglePlacesScript,
  searchDemoDestinations
} from '../utils/googlePlaces';

export interface DestinationAutocompleteProps {
  value: string;
  destinationData?: DestinationData;
  onChange: (value: string, data?: DestinationData) => void;
  placeholder?: string;
}

export function DestinationAutocomplete({
  value,
  destinationData,
  onChange,
  placeholder = 'Where are you going? (e.g. Paris, Tokyo, Bali)...'
}: DestinationAutocompleteProps) {
  const [googleConfigured] = useState(() => isGoogleMapsConfigured());
  const [googleReady, setGoogleReady] = useState(() => isGoogleMapsLoaded());
  const [googleLoading, setGoogleLoading] = useState(() => isGoogleMapsConfigured() && !isGoogleMapsLoaded());
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<DestinationData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const googleContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteElementRef = useRef<any>(null);

  // Load Google Places script if configured
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

  // Keep internal query in sync if external value changes
  useEffect(() => {
    setSearchQuery(value || '');
    if (autocompleteElementRef.current && autocompleteElementRef.current.value !== value) {
      try {
        autocompleteElementRef.current.value = value || '';
      } catch {
        // ignore
      }
    }
  }, [value]);

  // Modern PlaceAutocompleteElement for Google Maps Places API (New)
  useEffect(() => {
    if (!googleReady || !window.google?.maps || !googleContainerRef.current) {
      return;
    }

    let isSubscribed = true;

    async function initDestinationAutocomplete() {
      try {
        const placesLib = await window.google.maps.importLibrary('places');
        if (!isSubscribed || !googleContainerRef.current) {
          return;
        }

        const { PlaceAutocompleteElement } = placesLib;
        if (PlaceAutocompleteElement) {
          const element = new PlaceAutocompleteElement();
          element.placeholder = placeholder;
          if (value) {
            try {
              element.value = value;
            } catch {
              // ignore
            }
          }

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
                fields: ['displayName', 'formattedAddress', 'location', 'viewport', 'photos', 'id']
              });

              const extracted = extractGoogleDestinationData(place);
              onChange(extracted.name, extracted);
              setSearchQuery(extracted.name);
            } catch (err) {
              console.error('Error fetching destination fields:', err);
            }
          };

          const handleInput = (event: any) => {
            const currentVal = element.value || event.target?.value || '';
            setSearchQuery(currentVal);
            if (currentVal.trim()) {
              onChange(currentVal.trim());
            }
          };

          element.addEventListener('gmp-placeselect', handleSelect);
          element.addEventListener('gmp-select', handleSelect);
          element.addEventListener('input', handleInput);
        }
      } catch (err) {
        console.warn('Destination PlaceAutocompleteElement initialization error:', err);
      }
    }

    initDestinationAutocomplete();

    return () => {
      isSubscribed = false;
      autocompleteElementRef.current = null;
    };
  }, [googleReady]);

  // Demo suggestions logic when Google Maps is not active
  useEffect(() => {
    if (googleReady) {
      return;
    }

    const list = searchDemoDestinations(searchQuery);
    setSuggestions(list);
  }, [searchQuery, googleReady]);

  const handleSelectDemo = (item: DestinationData) => {
    onChange(item.name, item);
    setSearchQuery(item.name);
    setShowSuggestions(false);
  };

  const handleClear = () => {
    onChange('', undefined);
    setSearchQuery('');
    setShowSuggestions(false);
    if (autocompleteElementRef.current) {
      try {
        autocompleteElementRef.current.value = '';
      } catch {
        // ignore
      }
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="destination-autocomplete-wrap">
      {googleReady ? (
        <div className="destination-google-field">
          <div ref={googleContainerRef} className="google-places-new-slot destination-google-slot" />
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
        <div className="place-search-input-box destination-demo-input-box">
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
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            className="place-search-input"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions.length > 0) {
                  handleSelectDemo(suggestions[0]);
                } else if (searchQuery.trim()) {
                  onChange(searchQuery.trim());
                  setShowSuggestions(false);
                }
              }
            }}
          />

          {searchQuery ? (
            <button
              type="button"
              className="place-search-clear"
              onClick={handleClear}
              aria-label="Clear destination"
            >
              ×
            </button>
          ) : null}
        </div>
      )}

      {/* Demo suggestions dropdown */}
      {!googleReady && !googleLoading && showSuggestions && suggestions.length > 0 ? (
        <div className="places-suggestions-dropdown destination-suggestions-dropdown">
          <div className="places-suggestions-header">Popular travel destinations</div>
          {suggestions.map((item) => (
            <button
              key={item.placeId || item.name}
              type="button"
              className="places-suggestion-item"
              onClick={() => handleSelectDemo(item)}
            >
              {item.photoUrl ? (
                <img src={item.photoUrl} alt="" className="places-suggestion-thumb" loading="lazy" />
              ) : (
                <div className="places-suggestion-thumb-placeholder">✈️</div>
              )}
              <div className="places-suggestion-info">
                <strong className="places-suggestion-name">{item.name}</strong>
                {item.formattedAddress ? (
                  <span className="places-suggestion-addr">{item.formattedAddress}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {/* Selected destination indicator card */}
      {value ? (
        <div className="destination-selected-card">
          {destinationData?.photoUrl ? (
            <div className="destination-selected-thumb-wrap">
              <img src={destinationData.photoUrl} alt="" className="destination-selected-thumb" />
            </div>
          ) : (
            <div className="destination-selected-icon" aria-hidden="true">
              📍
            </div>
          )}
          <div className="destination-selected-info">
            <span className="destination-selected-eyebrow">Selected Destination</span>
            <strong className="destination-selected-name">{value}</strong>
            {destinationData?.formattedAddress && destinationData.formattedAddress !== value ? (
              <span className="destination-selected-address">{destinationData.formattedAddress}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="destination-clear-btn"
            onClick={handleClear}
            title="Change destination"
            aria-label="Change destination"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
