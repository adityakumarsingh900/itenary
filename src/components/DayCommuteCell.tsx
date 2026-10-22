import { useEffect, useState } from 'react';
import {
  CellValue,
  CommuteMode,
  CommuteSegmentData,
  getCellText
} from '../types';
import {
  calculateCommute,
  commuteCache,
  CommuteEstimate,
  getCommuteModeEmoji,
  getRouteCacheKey
} from '../utils/commute';

interface DayCommuteCellProps {
  rowKey: string;
  dayLabel: string;
  prevDayLabel: string;
  fromValue?: CellValue;
  toValue?: CellValue;
  preference?: CommuteSegmentData;
  onOpenCommute: () => void;
}

export function DayCommuteCell({
  dayLabel,
  prevDayLabel,
  fromValue,
  toValue,
  preference,
  onOpenCommute
}: DayCommuteCellProps) {
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
  const hasBothStops = Boolean(originName && destName);

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
  if (hasBothStops) {
    tooltipTitle = `Commute: ${originName} → ${destName}\n${displayTime}${
      displayDistance ? ` (${displayDistance})` : ''
    }\nClick to customize travel mode or edit time`;
  } else if (originName && !destName) {
    tooltipTitle = `Commute starting from "${originName}"\nAdd first stop on ${dayLabel} to calculate commute time`;
  } else if (!originName && destName) {
    tooltipTitle = `Commute arriving at "${destName}"\nAdd a stop on ${prevDayLabel} to calculate commute time`;
  } else {
    tooltipTitle = `Add stops on ${prevDayLabel} and ${dayLabel} to calculate commute time`;
  }

  return (
    <div
      className={`planner-cell-card planner-cell-card--travelling planner-cell-card--day-commute ${
        hasBothStops ? 'planner-cell-card--filled' : 'planner-cell-card--empty'
      } ${isLoading ? 'planner-cell-card--loading' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpenCommute}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenCommute();
        }
      }}
      title={tooltipTitle}
      aria-label={tooltipTitle}
    >
      <div className="day-commute-badge-wrap">
        <span className="day-commute-badge">DAY COMMUTE</span>
      </div>

      <div className="planner-cell-content planner-cell-content--travelling">
        <div className="travelling-icon-wrap" aria-hidden="true">
          <span className="travelling-emoji-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>
            {displayEmoji}
          </span>
        </div>

        <div
          className={`travelling-value-text ${
            !hasBothStops && !customText ? 'travelling-value-text--prompt' : ''
          }`}
        >
          {displayTime}
        </div>

        {displayDistance ? (
          <div className="day-commute-distance">{displayDistance}</div>
        ) : (
          <span className="day-commute-subtext">from prev day</span>
        )}
      </div>
    </div>
  );
}
