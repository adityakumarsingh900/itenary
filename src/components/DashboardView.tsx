import { useMemo, useState } from 'react';
import { DestinationData, PackingItem, PlannerCellMap, PlannerCommuteMap, CellType } from '../types';
import { buildDateRows } from '../utils/date';
import {
  buildDayOverviews,
  calculateStayDetails,
  calculateTripAnalytics,
  calculateTripCountdown,
  DEFAULT_PACKING_ITEMS
} from '../utils/dashboard';
import { DashboardMap } from './DashboardMap';

export interface DashboardViewProps {
  tripName: string;
  destination: string;
  destinationData?: DestinationData;
  startDate: string;
  endDate: string;
  rowOrders: Record<string, string[]>;
  cells: PlannerCellMap;
  cellTypes: Record<string, CellType>;
  commutes?: PlannerCommuteMap;
  packingList?: PackingItem[];
  tripNotes?: string;
  onPackingListChange: (items: PackingItem[]) => void;
  onTripNotesChange: (notes: string) => void;
  onNavigateToPlanner: (dayKey?: string) => void;
  onNavigateToSetup: () => void;
}

export function DashboardView({
  tripName,
  destination,
  destinationData,
  startDate,
  endDate,
  rowOrders,
  cells,
  cellTypes,
  commutes = {},
  packingList = DEFAULT_PACKING_ITEMS,
  tripNotes = '',
  onPackingListChange,
  onTripNotesChange,
  onNavigateToPlanner,
  onNavigateToSetup
}: DashboardViewProps) {
  const [selectedMapDayKey, setSelectedMapDayKey] = useState<string>('all');
  const [newPackingText, setNewPackingText] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Derive date rows
  const dateRows = useMemo(() => buildDateRows(startDate, endDate), [startDate, endDate]);

  // Derive stay details
  const stayDetails = useMemo(
    () => calculateStayDetails(dateRows, rowOrders, cells, cellTypes),
    [dateRows, rowOrders, cells, cellTypes]
  );

  // Derive trip countdown & status
  const countdown = useMemo(
    () => calculateTripCountdown(startDate, endDate),
    [startDate, endDate]
  );

  // Derive day overviews
  const dayOverviews = useMemo(
    () => buildDayOverviews(dateRows, rowOrders, cells, cellTypes, commutes, stayDetails.dailyStays),
    [dateRows, rowOrders, cells, cellTypes, commutes, stayDetails.dailyStays]
  );

  // Derive trip analytics
  const analytics = useMemo(
    () => calculateTripAnalytics(dateRows, rowOrders, cells, cellTypes, commutes, stayDetails),
    [dateRows, rowOrders, cells, cellTypes, commutes, stayDetails]
  );

  // Packing list calculations
  const totalPackingCount = packingList.length;
  const packedCount = packingList.filter((item) => item.done).length;
  const packingPercent = totalPackingCount > 0 ? Math.round((packedCount / totalPackingCount) * 100) : 0;

  const handleTogglePacking = (id: string) => {
    onPackingListChange(
      packingList.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleAddPackingItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackingText.trim()) return;
    const newItem: PackingItem = {
      id: `pack-${Date.now()}`,
      text: newPackingText.trim(),
      done: false,
      category: 'Custom'
    };
    onPackingListChange([...packingList, newItem]);
    setNewPackingText('');
  };

  const handleDeletePackingItem = (id: string) => {
    onPackingListChange(packingList.filter((item) => item.id !== id));
  };

  const handleResetPackingList = () => {
    if (window.confirm('Reset checklist to standard travel essentials?')) {
      onPackingListChange(DEFAULT_PACKING_ITEMS);
    }
  };

  // Copy trip summary to clipboard
  const handleCopySummary = async () => {
    const summaryLines: string[] = [
      `✈️ Trip: ${tripName || destination}`,
      `📍 Destination: ${destination}`,
      `📅 Dates: ${startDate} to ${endDate} (${analytics.totalDays} Days / ${analytics.totalNights} Nights)`,
      `🏨 Accommodations:`,
      ...stayDetails.uniqueStays.map(
        (s) => `  • ${s.name} (${s.nights} night${s.nights > 1 ? 's' : ''}: ${s.checkInDayLabel} – ${s.checkOutDayLabel})`
      ),
      '',
      '🗓️ Day-by-Day Plan:',
      ...dayOverviews.map((day) => {
        const stopsStr = day.stops.map((s) => s.name).join(' ➔ ');
        return `Day ${day.dayIndex} (${day.row.label}): Stay at ${day.stay.stayName || 'None set'}${stopsStr ? ` | Stops: ${stopsStr}` : ''}`;
      })
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    } catch {
      // Fallback
      alert('Could not copy automatically. You can print the summary instead!');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const heroPhotoUrl = destinationData?.photoUrl ||
    'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80';

  return (
    <main className="app-shell dashboard-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      {/* Top Application Bar */}
      <header className="dashboard-nav-bar">
        <div className="dashboard-nav-left">
          <div className="dashboard-nav-logo">✈️</div>
          <div>
            <h2 className="dashboard-nav-title">{tripName || destination || 'My Trip'}</h2>
            <span className="dashboard-nav-subtitle">
              📍 {destination} • {analytics.totalDays} Days, {analytics.totalNights} Nights
            </span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="view-switcher-tabs" role="tablist">
          <button
            type="button"
            className="view-tab"
            role="tab"
            aria-selected="false"
            onClick={() => onNavigateToPlanner()}
          >
            📋 Itinerary Planner
          </button>
          <button
            type="button"
            className="view-tab active"
            role="tab"
            aria-selected="true"
          >
            📊 Trip Dashboard
          </button>
        </div>

        {/* Quick Nav Actions */}
        <div className="dashboard-nav-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handleCopySummary}
            title="Copy trip itinerary summary to clipboard"
          >
            📋 {copiedNotification ? 'Copied!' : 'Copy Summary'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handlePrint}
            title="Print or save itinerary as PDF"
          >
            🖨️ Print / PDF
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onNavigateToSetup}
            title="Edit destination and travel dates"
          >
            ⚙️ Trip Details
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {copiedNotification && (
        <div className="dashboard-toast" role="status">
          ✅ Trip summary copied to clipboard! Ready to share.
        </div>
      )}

      {/* Hero Cover Card */}
      <section className="dashboard-hero-card">
        <div
          className="dashboard-hero-bg"
          style={{ backgroundImage: `url(${heroPhotoUrl})` }}
        />
        <div className="dashboard-hero-overlay" />

        <div className="dashboard-hero-content">
          <div className="dashboard-hero-badges">
            <span className="hero-pill hero-pill-duration">
              📅 {analytics.totalDays} Days • {analytics.totalNights} Nights
            </span>
            <span className={`hero-pill hero-pill-${countdown.badgeState}`}>
              {countdown.statusText}
            </span>
            <span
              className={`hero-pill ${
                stayDetails.missingStayDays.length === 0
                  ? 'hero-pill-success'
                  : 'hero-pill-warning'
              }`}
            >
              🏨 {analytics.staysCoveragePercent}% Nights Booked
            </span>
          </div>

          <h1 className="dashboard-hero-title">{tripName || destination}</h1>
          <p className="dashboard-hero-subtitle">
            {startDate} to {endDate} • {destination}
          </p>

          <div className="dashboard-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => onNavigateToPlanner()}
            >
              Edit in Planner ➔
            </button>
          </div>
        </div>
      </section>

      {/* Key Stats Bar */}
      <section className="dashboard-stats-grid">
        <div className="dashboard-stat-card">
          <span className="stat-icon">📅</span>
          <div>
            <strong className="stat-value">{analytics.totalDays} Days / {analytics.totalNights} Nights</strong>
            <span className="stat-label">Total Trip Duration</span>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <span className="stat-icon">🏨</span>
          <div>
            <strong className="stat-value">{stayDetails.uniqueStays.length} Places</strong>
            <span className="stat-label">
              {stayDetails.missingStayDays.length === 0
                ? 'All nights covered'
                : `${stayDetails.missingStayDays.length} unassigned night(s)`}
            </span>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <span className="stat-icon">📍</span>
          <div>
            <strong className="stat-value">{analytics.totalStops} Planned Stops</strong>
            <span className="stat-label">{analytics.totalPoints} sights • {analytics.totalPlaces} stays</span>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <span className="stat-icon">🚗</span>
          <div>
            <strong className="stat-value">{analytics.formattedDistance}</strong>
            <span className="stat-label">~{analytics.formattedDuration} on the road</span>
          </div>
        </div>
      </section>

      {/* Missing Stays Alert Banner if any day has no hotel */}
      {stayDetails.missingStayDays.length > 0 && (
        <div className="dashboard-alert-banner">
          <span className="alert-icon">⚠️</span>
          <div className="alert-text">
            <strong>Missing accommodation:</strong> You have not set a place to stay for{' '}
            {stayDetails.missingStayDays.map((d) => d.label).join(', ')}.
          </div>
          <button
            type="button"
            className="secondary-button alert-action-btn"
            onClick={() => onNavigateToPlanner(stayDetails.missingStayDays[0].key)}
          >
            Add Stay in Planner
          </button>
        </div>
      )}

      {/* Two Column Layout: Left Column = Stays & Day-by-Day Flow; Right Column = Map & Checklist */}
      <div className="dashboard-main-layout">
        <div className="dashboard-left-col">
          {/* SECTION: WHERE WE ARE STAYING (STAY MATRIX) */}
          <section className="dashboard-section-card">
            <div className="section-card-header">
              <div>
                <h2>🏨 Where We Are Staying</h2>
                <p>Day-by-day accommodations and nights breakdown for your trip.</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onNavigateToPlanner()}
              >
                + Manage Stays
              </button>
            </div>

            {/* Daily Stay Timeline Chips */}
            <div className="stay-timeline-container">
              <div className="stay-timeline-track">
                {dateRows.map((row, idx) => {
                  const stayInfo = stayDetails.dailyStays[row.key];
                  const hasStay = stayInfo?.hasStay;

                  return (
                    <div
                      key={row.key}
                      className={`stay-timeline-day-card ${hasStay ? 'has-stay' : 'empty-stay'} ${stayInfo?.isCheckIn ? 'is-checkin' : ''}`}
                    >
                      <div className="stay-day-meta">
                        <span className="stay-day-number">Day {idx + 1}</span>
                        <span className="stay-day-date">{row.label}</span>
                        <span className="stay-day-weekday">{row.weekday}</span>
                      </div>

                      <div className="stay-day-content">
                        {hasStay ? (
                          <>
                            <div className="stay-badge-row">
                              {stayInfo.isCheckIn && (
                                <span className="stay-tag checkin-tag">🏨 Check-in</span>
                              )}
                              {stayInfo.isInherited && (
                                <span className="stay-tag inherited-tag">🛏️ Continued</span>
                              )}
                              {stayInfo.isCheckOutNext && (
                                <span className="stay-tag checkout-tag">🧳 Next day move</span>
                              )}
                            </div>
                            <h4 className="stay-hotel-name">{stayInfo.stayName}</h4>
                            {stayInfo.address && (
                              <p className="stay-hotel-address">{stayInfo.address}</p>
                            )}
                          </>
                        ) : (
                          <div className="stay-empty-placeholder">
                            <span className="stay-empty-icon">⚠️</span>
                            <span>No stay set</span>
                            <button
                              type="button"
                              className="text-link-button"
                              onClick={() => onNavigateToPlanner(row.key)}
                            >
                              + Add stay
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="stay-planner-link"
                        onClick={() => onNavigateToPlanner(row.key)}
                        title={`Jump to ${row.label} in planner`}
                      >
                        Edit day in planner ➔
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unique Accommodations Overview */}
            {stayDetails.uniqueStays.length > 0 && (
              <div className="unique-stays-wrapper">
                <h3 className="sub-heading">Properties & Resorts ({stayDetails.uniqueStays.length})</h3>
                <div className="unique-stays-grid">
                  {stayDetails.uniqueStays.map((stay) => (
                    <div key={stay.id} className="unique-stay-card">
                      {stay.photoUrl ? (
                        <div
                          className="unique-stay-thumb"
                          style={{ backgroundImage: `url(${stay.photoUrl})` }}
                        />
                      ) : (
                        <div className="unique-stay-thumb unique-stay-thumb-fallback">
                          🏨
                        </div>
                      )}
                      <div className="unique-stay-body">
                        <div className="unique-stay-nights-badge">
                          {stay.nights} Night{stay.nights > 1 ? 's' : ''}
                        </div>
                        <h4 className="unique-stay-title">{stay.name}</h4>
                        {stay.address && <p className="unique-stay-address">{stay.address}</p>}
                        <div className="unique-stay-dates">
                          {stay.checkInDayLabel} ➔ {stay.checkOutDayLabel}
                        </div>
                        <div className="unique-stay-actions">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.name + ' ' + (stay.address || ''))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="secondary-button unique-stay-link"
                          >
                            Directions ↗
                          </a>
                          <button
                            type="button"
                            className="secondary-button unique-stay-link"
                            onClick={() => onNavigateToPlanner(stay.checkInDate)}
                          >
                            Open in Planner
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* SECTION: DAY-BY-DAY JOURNEY FLOW */}
          <section className="dashboard-section-card">
            <div className="section-card-header">
              <div>
                <h2>🗓️ Day-by-Day Journey Flow</h2>
                <p>Visual overview of stops, transit times, and pace for each day.</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onNavigateToPlanner()}
              >
                Edit Schedule
              </button>
            </div>

            <div className="day-flow-list">
              {dayOverviews.map((day) => (
                <div key={day.row.key} className="day-flow-card">
                  <div className="day-flow-header">
                    <div className="day-flow-title-wrap">
                      <span className="day-number-badge">Day {day.dayIndex}</span>
                      <div>
                        <h3 className="day-date-heading">{day.row.label}</h3>
                        <span className="day-sub-heading">{day.row.weekday}</span>
                      </div>
                    </div>

                    <div className="day-meta-tags">
                      {day.stay.hasStay ? (
                        <span className="day-stay-pill">
                          🏨 Stay: <strong>{day.stay.stayName}</strong>
                        </span>
                      ) : (
                        <span className="day-stay-pill day-stay-pill-empty">
                          ⚠️ No Stay Set
                        </span>
                      )}

                      <span className={`day-pace-pill pace-${day.pace.toLowerCase()}`}>
                        {day.pace === 'Relaxed' && '🌱 Relaxed'}
                        {day.pace === 'Moderate' && '⚡ Moderate'}
                        {day.pace === 'Packed' && '🔥 Packed'} ({day.totalStops} stops)
                      </span>

                      <button
                        type="button"
                        className="secondary-button day-jump-btn"
                        onClick={() => onNavigateToPlanner(day.row.key)}
                        title="Open this day in the planner table"
                      >
                        Edit Day ➔
                      </button>
                    </div>
                  </div>

                  {/* Stops flow pipeline */}
                  {day.stops.length > 0 ? (
                    <div className="day-stops-pipeline">
                      {day.stops.map((stop, sIdx) => {
                        const transit = day.transits[sIdx - 1];
                        const isStayType = stop.type === 'place';

                        return (
                          <div key={stop.slotId} className="day-pipeline-step">
                            {/* Commute badge connecting stops */}
                            {sIdx > 0 && transit && (
                              <div className="day-pipeline-commute">
                                <span className="commute-line" />
                                <span
                                  className="commute-pill"
                                  title={`${transit.fromName} ➔ ${transit.toName}`}
                                >
                                  🚗 {transit.durationText || 'Commute'}
                                </span>
                                <span className="commute-line" />
                              </div>
                            )}

                            {/* Stop node chip */}
                            <div className={`day-stop-chip ${isStayType ? 'stop-chip-stay' : 'stop-chip-point'}`}>
                              {stop.photoUrl ? (
                                <img
                                  src={stop.photoUrl}
                                  alt={stop.name}
                                  className="stop-chip-img"
                                />
                              ) : (
                                <span className="stop-chip-icon">
                                  {isStayType ? '🏨' : '📍'}
                                </span>
                              )}
                              <div className="stop-chip-info">
                                <span className="stop-chip-type">
                                  {isStayType ? 'Stay / Hotel' : 'Activity / Sight'}
                                </span>
                                <span className="stop-chip-name">{stop.name}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="day-flow-empty">
                      <span>No planned stops for this date yet.</span>
                      <button
                        type="button"
                        className="text-link-button"
                        onClick={() => onNavigateToPlanner(day.row.key)}
                      >
                        + Add first activity
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Interactive Map, Readiness & Packing, Notes */}
        <div className="dashboard-right-col">
          {/* MAP COMPONENT */}
          <DashboardMap
            destination={destination}
            destinationData={destinationData}
            dayOverviews={dayOverviews}
            selectedDayKey={selectedMapDayKey}
            onSelectDayKey={setSelectedMapDayKey}
            onNavigateToPlannerDay={onNavigateToPlanner}
          />

          {/* PACKING & TRIP READINESS CARD */}
          <section className="dashboard-section-card packing-card">
            <div className="section-card-header">
              <div>
                <h2>✅ Packing & Readiness</h2>
                <p>
                  {packedCount} of {totalPackingCount} items ready ({packingPercent}%)
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={handleResetPackingList}
                title="Reset to default items"
              >
                Reset
              </button>
            </div>

            {/* Progress bar */}
            <div className="packing-progress-bar-bg">
              <div
                className="packing-progress-bar-fill"
                style={{ width: `${packingPercent}%` }}
              />
            </div>

            {/* Packing items list */}
            <div className="packing-items-list">
              {packingList.map((item) => (
                <div
                  key={item.id}
                  className={`packing-item-row ${item.done ? 'packing-item-done' : ''}`}
                >
                  <label className="packing-checkbox-label">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => handleTogglePacking(item.id)}
                      className="packing-checkbox"
                    />
                    <span className="packing-item-text">{item.text}</span>
                  </label>
                  {item.category && (
                    <span className="packing-item-cat-pill">{item.category}</span>
                  )}
                  <button
                    type="button"
                    className="packing-delete-btn"
                    onClick={() => handleDeletePackingItem(item.id)}
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add new packing item */}
            <form onSubmit={handleAddPackingItem} className="packing-add-form">
              <input
                type="text"
                placeholder="+ Add packing item..."
                value={newPackingText}
                onChange={(e) => setNewPackingText(e.target.value)}
                className="packing-input"
              />
              <button type="submit" className="secondary-button packing-add-btn">
                Add
              </button>
            </form>
          </section>

          {/* TRIP NOTES & EMERGENCY INFO */}
          <section className="dashboard-section-card notes-card">
            <div className="section-card-header">
              <div>
                <h2>📝 Quick Trip Notes</h2>
                <p>Booking codes, flights, emergency numbers & reminders.</p>
              </div>
            </div>

            <textarea
              className="dashboard-notes-textarea"
              placeholder="e.g. Flight QR890 leaves at 14:30&#10;Hotel reservation: #AM-88491&#10;Driver WhatsApp: +62 812 3456 789&#10;Emergency contact: Mum +1..."
              value={tripNotes}
              onChange={(e) => onTripNotesChange(e.target.value)}
              rows={6}
            />
            <span className="notes-save-hint">Autosaved to your browser.</span>
          </section>
        </div>
      </div>
    </main>
  );
}
