import { useEffect, useRef, useState } from 'react';
import { DestinationData } from '../types';
import { DayOverview, DayStopSummary } from '../utils/dashboard';
import { isGoogleMapsLoaded } from '../utils/googlePlaces';

interface DashboardMapProps {
  destination: string;
  destinationData?: DestinationData;
  dayOverviews: DayOverview[];
  selectedDayKey: string; // 'all' or specific rowKey
  onSelectDayKey: (key: string) => void;
  onNavigateToPlannerDay?: (rowKey: string) => void;
}

export function DashboardMap({
  destination,
  destinationData,
  dayOverviews,
  selectedDayKey,
  onSelectDayKey,
  onNavigateToPlannerDay
}: DashboardMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(isGoogleMapsLoaded);

  useEffect(() => {
    if (isGoogleMapsLoaded()) {
      setMapsReady(true);
      return;
    }
    const checkInterval = setInterval(() => {
      if (isGoogleMapsLoaded()) {
        setMapsReady(true);
        clearInterval(checkInterval);
      }
    }, 200);

    return () => clearInterval(checkInterval);
  }, []);

  // Filter stops based on selected day
  const activeStops = selectedDayKey === 'all'
    ? dayOverviews.flatMap((day) =>
        day.stops.map((stop) => ({
          ...stop,
          dayIndex: day.dayIndex,
          dayLabel: day.row.label,
          rowKey: day.row.key
        }))
      )
    : (dayOverviews.find((day) => day.row.key === selectedDayKey)?.stops ?? []).map((stop) => {
        const day = dayOverviews.find((d) => d.row.key === selectedDayKey)!;
        return {
          ...stop,
          dayIndex: day.dayIndex,
          dayLabel: day.row.label,
          rowKey: day.row.key
        };
      });

  const validStopsWithCoords = activeStops.filter((s) => s.location && s.location.lat && s.location.lng);

  // Initialize or update Google Map
  useEffect(() => {
    if (!mapsReady || !mapContainerRef.current || !window.google?.maps) {
      return;
    }

    if (!mapInstanceRef.current) {
      const defaultCenter = destinationData?.location || { lat: -8.409518, lng: 115.188916 };
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 11,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'simplified' }] }
        ]
      });

      infoWindowRef.current = new window.google.maps.InfoWindow();
    }

    const map = mapInstanceRef.current;

    // Clear old markers and lines
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((line) => line.setMap(null));
    polylinesRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    let hasCoords = false;

    // Plot markers
    validStopsWithCoords.forEach((stop, idx) => {
      const pos = { lat: stop.location!.lat, lng: stop.location!.lng };
      bounds.extend(pos);
      hasCoords = true;

      const isStay = stop.type === 'place';
      const markerColor = isStay ? '#8b5cf6' : '#f97316';
      const markerSymbol = isStay ? '🏨' : `${idx + 1}`;

      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        title: stop.name,
        label: {
          text: markerSymbol,
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: isStay ? '14px' : '12px'
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isStay ? 15 : 13,
          fillColor: markerColor,
          fillOpacity: 0.95,
          strokeWeight: 2,
          strokeColor: '#ffffff'
        }
      });

      marker.addListener('click', () => {
        const content = `
          <div style="font-family: inherit; font-size: 13px; max-width: 220px; color: #1e293b; padding: 4px;">
            ${stop.photoUrl ? `<img src="${stop.photoUrl}" alt="${stop.name}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />` : ''}
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${markerColor}; margin-bottom: 2px;">
              Day ${stop.dayIndex} • ${isStay ? 'Stay / Accommodation' : 'Activity'}
            </div>
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${stop.name}</div>
            ${stop.address ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${stop.address}</div>` : ''}
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + ' ' + (stop.address || ''))}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; text-decoration: underline; font-size: 11px; font-weight: 600;">Open in Google Maps ↗</a>
          </div>
        `;
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(map, marker);
      });

      markersRef.current.push(marker);
    });

    // Draw route lines connecting consecutive stops for each day
    if (selectedDayKey === 'all') {
      dayOverviews.forEach((day, dIdx) => {
        const dayCoords = day.stops
          .filter((s) => s.location && s.location.lat && s.location.lng)
          .map((s) => ({ lat: s.location!.lat, lng: s.location!.lng }));

        if (dayCoords.length > 1) {
          const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];
          const polyline = new window.google.maps.Polyline({
            path: dayCoords,
            geodesic: true,
            strokeColor: colors[dIdx % colors.length],
            strokeOpacity: 0.8,
            strokeWeight: 3.5,
            map
          });
          polylinesRef.current.push(polyline);
        }
      });
    } else {
      const singleDayCoords = validStopsWithCoords.map((s) => ({
        lat: s.location!.lat,
        lng: s.location!.lng
      }));
      if (singleDayCoords.length > 1) {
        const polyline = new window.google.maps.Polyline({
          path: singleDayCoords,
          geodesic: true,
          strokeColor: '#6366f1',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map
        });
        polylinesRef.current.push(polyline);
      }
    }

    if (hasCoords) {
      if (validStopsWithCoords.length === 1) {
        map.setCenter({
          lat: validStopsWithCoords[0].location!.lat,
          lng: validStopsWithCoords[0].location!.lng
        });
        map.setZoom(13);
      } else {
        map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      }
    } else if (destinationData?.location) {
      map.setCenter(destinationData.location);
      map.setZoom(10);
    }
  }, [mapsReady, selectedDayKey, dayOverviews, validStopsWithCoords, destinationData]);

  // Google Maps directions web link
  const directionsUrl = (() => {
    if (validStopsWithCoords.length < 2) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
    }
    const origin = encodeURIComponent(validStopsWithCoords[0].name);
    const dest = encodeURIComponent(validStopsWithCoords[validStopsWithCoords.length - 1].name);
    const waypoints = validStopsWithCoords
      .slice(1, -1)
      .map((s) => encodeURIComponent(s.name))
      .join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
  })();

  return (
    <div className="dashboard-map-card">
      <div className="dashboard-map-header">
        <div className="dashboard-map-title-row">
          <div>
            <h3>Interactive Trip Map & Route</h3>
            <p className="dashboard-map-subtitle">
              {validStopsWithCoords.length > 0
                ? `${validStopsWithCoords.length} plotted places on map`
                : `Showing general area for ${destination}`}
            </p>
          </div>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary-button dashboard-map-open-link"
            title="Open route in Google Maps in a new tab"
          >
            🗺️ Open in Google Maps ↗
          </a>
        </div>

        {/* Day selection tabs */}
        <div className="dashboard-map-days-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={selectedDayKey === 'all'}
            className={`dashboard-map-day-pill ${selectedDayKey === 'all' ? 'active' : ''}`}
            onClick={() => onSelectDayKey('all')}
          >
            All Days ({dayOverviews.length})
          </button>
          {dayOverviews.map((day) => {
            const dayStopsCount = day.stops.filter((s) => s.location).length;
            return (
              <button
                key={day.row.key}
                type="button"
                role="tab"
                aria-selected={selectedDayKey === day.row.key}
                className={`dashboard-map-day-pill ${selectedDayKey === day.row.key ? 'active' : ''}`}
                onClick={() => onSelectDayKey(day.row.key)}
              >
                Day {day.dayIndex} {dayStopsCount > 0 ? `(${dayStopsCount})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Map Canvas / Fallback */}
      <div className="dashboard-map-canvas-wrapper">
        <div ref={mapContainerRef} className="dashboard-map-canvas" />

        {!mapsReady && (
          <div className="dashboard-map-empty-overlay">
            <span className="dashboard-map-empty-icon">📍</span>
            <h4>Map Preview</h4>
            <p>
              Loading Google Maps for <strong>{destination}</strong>...
            </p>
          </div>
        )}

        {mapsReady && validStopsWithCoords.length === 0 && (
          <div className="dashboard-map-info-badge">
            ℹ️ Tip: Search and select places from the search dropdown in the Planner to display exact map coordinates!
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="dashboard-map-legend">
        <div className="dashboard-legend-item">
          <span className="legend-dot legend-stay" />
          <span>Hotels & Overnight Stays</span>
        </div>
        <div className="dashboard-legend-item">
          <span className="legend-dot legend-point" />
          <span>Activities, Food & Sights</span>
        </div>
        <div className="dashboard-legend-item">
          <span className="legend-line" />
          <span>Transit Route</span>
        </div>
      </div>
    </div>
  );
}
