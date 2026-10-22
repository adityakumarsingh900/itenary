import { useState, useEffect, useRef } from 'react';
import {
  CellValue,
  CellType,
  CommuteMode,
  CommuteSegmentData,
  DateRow,
  DestinationData,
  getCellAddress,
  getCellPhoto,
  getCellText,
  PlannerCellMap,
  PlannerCommuteMap,
  resolveCellType
} from '../types';
import {
  calculateCommute,
  commuteCache,
  CommuteEstimate,
  findFirstContentCell,
  findLastContentCell,
  getCommuteModeEmoji,
  getRouteCacheKey
} from '../utils/commute';

export interface MobilePlannerViewProps {
  tripName: string;
  destination: string;
  destinationData?: DestinationData;
  startDate: string;
  endDate: string;
  dateRows: DateRow[];
  dateRowStays: Record<string, { name: string; cellValue?: CellValue; isInherited: boolean }>;
  rowOrders: Record<string, string[]>;
  cells: PlannerCellMap;
  cellTypes: Record<string, CellType>;
  commutes?: PlannerCommuteMap;
  onOpenEditCell: (cell: {
    rowKey: string;
    columnId: string;
    value: CellValue;
    type: CellType;
  }) => void;
  onOpenPicker: (target: { rowKey: string; insertIndex?: number }) => void;
  onOpenCommute: (segment: {
    rowKey: string;
    fromSlotId: string;
    toSlotId: string;
    fromValue: CellValue;
    toValue: CellValue;
    preference?: CommuteSegmentData;
    isDayCommute?: boolean;
  }) => void;
  onDeleteCell: (cell: { rowKey: string; slotId: string; value: CellValue }) => void;
  onRowOrdersChange: (orders: Record<string, string[]>) => void;
}

// ---------------------------------------------------------------------------
// Mobile Day Commute Card (Inter-day: Prev Day Last Stop -> Current Day First Stop)
// ---------------------------------------------------------------------------
function MobileDayCommuteCard({
  dayLabel,
  prevDayLabel,
  fromValue,
  toValue,
  preference,
  onOpenCommute
}: {
  dayLabel: string;
  prevDayLabel: string;
  fromValue?: CellValue;
  toValue?: CellValue;
  preference?: CommuteSegmentData;
  onOpenCommute: () => void;
}) {
  const mode: CommuteMode = preference?.mode || 'DRIVING';
  const customText = preference?.customText?.trim();

  const cacheKey = getRouteCacheKey(fromValue, toValue, mode);
  const cached = cacheKey ? commuteCache.get(cacheKey) : null;

  const [estimate, setEstimate] = useState<CommuteEstimate | null>(cached || null);
  const [isLoading, setIsLoading] = useState<boolean>(!customText && !cached && Boolean(cacheKey));

  useEffect(() => {
    let isCancelled = false;

    if (customText) {
      setIsLoading(false);
      return;
    }

    if (!cacheKey || !fromValue || !toValue) {
      setIsLoading(false);
      return;
    }

    const existing = commuteCache.get(cacheKey);
    if (existing) {
      setEstimate(existing);
      setIsLoading(false);
      return;
    }

    setEstimate(null);
    setIsLoading(true);
    calculateCommute(fromValue, toValue, mode)
      .then((res) => {
        if (!isCancelled && res) {
          commuteCache.set(cacheKey, res);
          setEstimate(res);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, fromValue, toValue, mode, customText]);

  const originName = fromValue ? getCellText(fromValue) : '';
  const destName = toValue ? getCellText(toValue) : '';
  const hasBoth = Boolean(originName && destName);
  const displayEmoji = getCommuteModeEmoji(mode);

  let displayTime = '';
  if (customText) {
    displayTime = customText;
  } else if (estimate?.durationText) {
    displayTime = estimate.durationText;
  } else if (preference?.durationText) {
    displayTime = preference.durationText;
  } else if (isLoading) {
    displayTime = '···';
  } else if (!originName && !destName) {
    displayTime = 'Add stops';
  } else if (!originName) {
    displayTime = `Add ${prevDayLabel} stop`;
  } else if (!destName) {
    displayTime = 'Add 1st stop';
  } else {
    displayTime = 'Commute';
  }

  const displayDistance = estimate?.distanceText || preference?.distanceText;

  let tooltipTitle = `Commute from ${prevDayLabel} to ${dayLabel}`;
  if (hasBoth) {
    tooltipTitle = `Commute: ${originName} → ${destName}\n${displayTime}${
      displayDistance ? ` (${displayDistance})` : ''
    }`;
  }

  return (
    <div
      className={`mobile-day-commute-card ${isLoading ? 'mobile-day-commute-card--loading' : ''}`}
      onClick={onOpenCommute}
      role="button"
      tabIndex={0}
      title={tooltipTitle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenCommute();
        }
      }}
    >
      <div className="mobile-commute-track-icon" aria-hidden="true">
        <span>{displayEmoji}</span>
      </div>

      <div className="mobile-commute-details">
        <div className="mobile-commute-meta-row">
          <span className="mobile-commute-tag">DAY COMMUTE</span>
          {displayDistance ? (
            <span className="mobile-commute-dist">{displayDistance}</span>
          ) : null}
        </div>

        <div className="mobile-commute-time-row">
          <strong className="mobile-commute-duration">{displayTime}</strong>
          {hasBoth ? (
            <span className="mobile-commute-route-text">
              {originName} → {destName}
            </span>
          ) : (
            <span className="mobile-commute-route-empty">from previous day</span>
          )}
        </div>
      </div>

      <span className="mobile-commute-edit-indicator" aria-hidden="true">
        ›
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Inter-stop Commute Connector (Between stops on the same day)
// ---------------------------------------------------------------------------
function MobileCommuteStep({
  fromValue,
  toValue,
  preference,
  onOpenCommute,
  onInsert
}: {
  fromValue?: CellValue;
  toValue?: CellValue;
  preference?: CommuteSegmentData;
  onOpenCommute: () => void;
  onInsert: () => void;
}) {
  const mode: CommuteMode = preference?.mode || 'DRIVING';
  const customText = preference?.customText?.trim();

  const cacheKey = getRouteCacheKey(fromValue, toValue, mode);
  const cached = cacheKey ? commuteCache.get(cacheKey) : null;

  const [estimate, setEstimate] = useState<CommuteEstimate | null>(cached || null);
  const [isLoading, setIsLoading] = useState<boolean>(!customText && !cached && Boolean(cacheKey));

  useEffect(() => {
    let isCancelled = false;

    if (customText) {
      setIsLoading(false);
      return;
    }

    if (!cacheKey || !fromValue || !toValue) {
      setIsLoading(false);
      return;
    }

    const existing = commuteCache.get(cacheKey);
    if (existing) {
      setEstimate(existing);
      setIsLoading(false);
      return;
    }

    setEstimate(null);
    setIsLoading(true);
    calculateCommute(fromValue, toValue, mode)
      .then((res) => {
        if (!isCancelled && res) {
          commuteCache.set(cacheKey, res);
          setEstimate(res);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, fromValue, toValue, mode, customText]);

  const originName = fromValue ? getCellText(fromValue) : '';
  const destName = toValue ? getCellText(toValue) : '';
  const displayEmoji = getCommuteModeEmoji(mode);
  const displayTime =
    customText ||
    estimate?.durationText ||
    preference?.durationText ||
    (isLoading ? '···' : 'Commute');
  const displayDistance = estimate?.distanceText || preference?.distanceText;

  const tooltipTitle =
    originName && destName
      ? `${originName} → ${destName}\n${displayTime}${
          displayDistance ? ` (${displayDistance})` : ''
        }`
      : 'Commute between stops';

  return (
    <div className="mobile-commute-step">
      <div className="mobile-commute-connector-line" aria-hidden="true" />

      <button
        type="button"
        className={`mobile-commute-pill ${isLoading ? 'mobile-commute-pill--loading' : ''}`}
        onClick={onOpenCommute}
        title={tooltipTitle}
        aria-label={tooltipTitle}
      >
        <span className="mobile-commute-pill-emoji" aria-hidden="true">
          {displayEmoji}
        </span>
        <span className="mobile-commute-pill-time">{displayTime}</span>
        {displayDistance ? (
          <span className="mobile-commute-pill-dist">{displayDistance}</span>
        ) : null}
      </button>

      <button
        type="button"
        className="mobile-commute-insert-btn"
        onClick={onInsert}
        title="Insert stop here"
        aria-label="Insert stop here"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MobilePlannerView Component
// ---------------------------------------------------------------------------
export function MobilePlannerView({
  dateRows,
  dateRowStays,
  rowOrders,
  cells,
  cellTypes,
  commutes,
  onOpenEditCell,
  onOpenPicker,
  onOpenCommute,
  onDeleteCell,
  onRowOrdersChange
}: MobilePlannerViewProps) {
  const [selectedDayKey, setSelectedDayKey] = useState<string>('all');
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleSelectTab = (key: string) => {
    setSelectedDayKey(key);
    if (key !== 'all' && dayRefs.current[key]) {
      dayRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleMoveStop = (rowKey: string, slotId: string, direction: 'up' | 'down') => {
    const order = rowOrders[rowKey] ?? [];
    const currentIndex = order.indexOf(slotId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;

    const nextOrder = [...order];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);

    onRowOrdersChange({
      ...rowOrders,
      [rowKey]: nextOrder
    });
  };

  const visibleDateRows =
    selectedDayKey === 'all'
      ? dateRows
      : dateRows.filter((r) => r.key === selectedDayKey);

  return (
    <div className="mobile-planner-root">
      {/* Sticky Day Selector Navigation Pills */}
      <nav className="mobile-planner-nav" aria-label="Day filter">
        <div className="mobile-planner-nav-scroll">
          <button
            type="button"
            className={`mobile-day-pill ${selectedDayKey === 'all' ? 'mobile-day-pill--active' : ''}`}
            onClick={() => handleSelectTab('all')}
          >
            All Days
          </button>
          {dateRows.map((row, index) => {
            const isActive = selectedDayKey === row.key;
            return (
              <button
                key={row.key}
                type="button"
                className={`mobile-day-pill ${isActive ? 'mobile-day-pill--active' : ''}`}
                onClick={() => handleSelectTab(row.key)}
              >
                Day {index + 1}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Vertical Timeline Feed */}
      <div className="mobile-planner-feed">
        {visibleDateRows.map((row) => {
          const rowIndex = dateRows.findIndex((r) => r.key === row.key);
          const order = rowOrders[row.key] ?? [];
          const stay = dateRowStays[row.key];

          // Compute day commute from previous day if rowIndex > 0
          const prevRow = rowIndex > 0 ? dateRows[rowIndex - 1] : null;
          let prevLastCell = prevRow
            ? findLastContentCell(rowOrders[prevRow.key], cells[prevRow.key])
            : null;
          let effectivePrevRow = prevRow;

          if (rowIndex > 0 && (!prevLastCell || !getCellText(prevLastCell.value).trim())) {
            for (let i = rowIndex - 2; i >= 0; i--) {
              const earlierRow = dateRows[i];
              const earlierCell = findLastContentCell(rowOrders[earlierRow.key], cells[earlierRow.key]);
              if (earlierCell && getCellText(earlierCell.value).trim()) {
                prevLastCell = earlierCell;
                effectivePrevRow = earlierRow;
                break;
              }
            }
          }

          const currFirstCell = findFirstContentCell(order, cells[row.key]);
          const dayCommuteKey = `dayCommute:${row.key}`;

          return (
            <section
              key={row.key}
              ref={(el) => (dayRefs.current[row.key] = el)}
              className="mobile-day-section"
            >
              {/* Day Header Card */}
              <div className="mobile-day-header">
                <div className="mobile-day-title-wrap">
                  <span className="mobile-day-number">DAY {rowIndex + 1}</span>
                  <h3 className="mobile-day-date">{row.label}</h3>
                  <span className="mobile-day-weekday">{row.weekday}</span>
                </div>

                {/* Stay Place Card */}
                <div
                  className={`mobile-stay-pill ${
                    stay?.name
                      ? stay.isInherited
                        ? 'mobile-stay-pill--inherited'
                        : 'mobile-stay-pill--set'
                      : 'mobile-stay-pill--empty'
                  }`}
                  onClick={() => onOpenPicker({ rowKey: row.key })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenPicker({ rowKey: row.key });
                    }
                  }}
                  title={
                    stay?.name
                      ? stay.isInherited
                        ? `Stay: ${stay.name} (continued from previous day)`
                        : `Stay: ${stay.name} (last place of day)`
                      : 'Tap to add place for stay'
                  }
                >
                  <span className="mobile-stay-icon" aria-hidden="true">
                    🏨
                  </span>
                  <div className="mobile-stay-info">
                    <span className="mobile-stay-name">
                      {stay?.name || 'Add place'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Day Commute (Days after Day 1) */}
              {rowIndex > 0 && prevRow ? (
                <div className="mobile-day-commute-wrap">
                  <MobileDayCommuteCard
                    dayLabel={row.label}
                    prevDayLabel={effectivePrevRow?.label || prevRow.label}
                    fromValue={prevLastCell?.value}
                    toValue={currFirstCell?.value}
                    preference={commutes?.[dayCommuteKey]}
                    onOpenCommute={() =>
                      onOpenCommute({
                        rowKey: row.key,
                        fromSlotId: prevLastCell?.slotId || 'prev-day-last',
                        toSlotId: currFirstCell?.slotId || 'curr-day-first',
                        fromValue: prevLastCell?.value ?? '',
                        toValue: currFirstCell?.value ?? '',
                        preference: commutes?.[dayCommuteKey],
                        isDayCommute: true
                      })
                    }
                  />
                </div>
              ) : null}

              {/* Vertical Stops Timeline */}
              <div className="mobile-stops-timeline">
                {order.length === 0 ? (
                  <div className="mobile-empty-stops">
                    <p>No activities added for this day yet.</p>
                    <button
                      type="button"
                      className="primary-button mobile-add-first-stop-btn"
                      onClick={() => onOpenPicker({ rowKey: row.key })}
                    >
                      + Add first stop
                    </button>
                  </div>
                ) : (
                  order.map((slotId, index) => {
                    const cellType = resolveCellType(slotId, cellTypes);
                    const cellVal = cells[row.key]?.[slotId] ?? '';
                    const text = getCellText(cellVal);
                    const address = cellType !== 'travelling' ? getCellAddress(cellVal) : undefined;
                    const photoUrl = cellType !== 'travelling' ? getCellPhoto(cellVal) : undefined;

                    const prevSlotId = index > 0 ? order[index - 1] : null;
                    const segmentKey = prevSlotId ? `${row.key}:${prevSlotId}->${slotId}` : '';

                    return (
                      <div key={slotId} className="mobile-timeline-node">
                        {/* Commute Step from previous stop */}
                        {index > 0 && prevSlotId ? (
                          <MobileCommuteStep
                            fromValue={cells[row.key]?.[prevSlotId]}
                            toValue={cellVal}
                            preference={commutes?.[segmentKey]}
                            onOpenCommute={() =>
                              onOpenCommute({
                                rowKey: row.key,
                                fromSlotId: prevSlotId,
                                toSlotId: slotId,
                                fromValue: cells[row.key]?.[prevSlotId] ?? '',
                                toValue: cellVal,
                                preference: commutes?.[segmentKey]
                              })
                            }
                            onInsert={() =>
                              onOpenPicker({ rowKey: row.key, insertIndex: index })
                            }
                          />
                        ) : null}

                        {/* Activity Card */}
                        <div
                          className={`mobile-stop-card mobile-stop-card--${cellType} ${
                            photoUrl ? 'mobile-stop-card--has-photo' : ''
                          }`}
                        >
                          {/* Index badge */}
                          <div className="mobile-stop-index">{index + 1}</div>

                          {/* Card Content (Click to edit) */}
                          <div
                            className="mobile-stop-content"
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              onOpenEditCell({
                                rowKey: row.key,
                                columnId: slotId,
                                value: cellVal,
                                type: cellType
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpenEditCell({
                                  rowKey: row.key,
                                  columnId: slotId,
                                  value: cellVal,
                                  type: cellType
                                });
                              }
                            }}
                          >
                            {photoUrl ? (
                              <div className="mobile-stop-photo-wrap">
                                <img
                                  src={photoUrl}
                                  alt=""
                                  className="mobile-stop-photo"
                                  loading="lazy"
                                />
                                <div className="mobile-stop-photo-gradient" />
                              </div>
                            ) : null}

                            <div className="mobile-stop-text-wrap">
                              <span
                                className={`mobile-stop-type-badge mobile-stop-type-badge--${cellType}`}
                              >
                                {cellType === 'place' ? 'Place' : 'Point'}
                              </span>
                              <strong className="mobile-stop-title">
                                {text || (cellType === 'place' ? 'Add place' : 'Add point')}
                              </strong>
                              {address ? (
                                <span className="mobile-stop-address">{address}</span>
                              ) : null}
                            </div>
                          </div>

                          {/* Action Buttons: Move Up, Move Down, Delete */}
                          <div className="mobile-stop-actions">
                            <button
                              type="button"
                              className="mobile-stop-action-btn"
                              disabled={index === 0}
                              onClick={() => handleMoveStop(row.key, slotId, 'up')}
                              title="Move stop earlier"
                              aria-label="Move stop earlier"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="mobile-stop-action-btn"
                              disabled={index === order.length - 1}
                              onClick={() => handleMoveStop(row.key, slotId, 'down')}
                              title="Move stop later"
                              aria-label="Move stop later"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="mobile-stop-action-btn mobile-stop-action-btn--delete"
                              onClick={() =>
                                onDeleteCell({
                                  rowKey: row.key,
                                  slotId,
                                  value: cellVal
                                })
                              }
                              title="Delete stop"
                              aria-label="Delete stop"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Add Stop Button at Bottom of Day */}
                {order.length > 0 ? (
                  <button
                    type="button"
                    className="mobile-add-stop-bar"
                    onClick={() => onOpenPicker({ rowKey: row.key })}
                  >
                    <span className="mobile-add-stop-plus">+</span>
                    <span>Add stop to {row.label}</span>
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
