import { useEffect, useState } from 'react';
import {
  CellValue,
  CommuteMode,
  CommuteSegmentData,
  getCellAddress,
  getCellLocation,
  getCellText
} from '../types';
import {
  calculateCommute,
  commuteCache,
  CommuteEstimate,
  getCommuteModeEmoji,
  getRouteCacheKey
} from '../utils/commute';

interface CommuteBridgeProps {
  rowKey: string;
  fromSlotId: string;
  toSlotId: string;
  fromValue?: CellValue;
  toValue?: CellValue;
  preference?: CommuteSegmentData;
  onOpenCommute: () => void;
  onInsert: () => void;
}

export function CommuteBridge({
  fromValue,
  toValue,
  preference,
  onOpenCommute,
  onInsert
}: CommuteBridgeProps) {
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
  const displayTime = customText || estimate?.durationText || preference?.durationText || (isLoading ? '···' : 'Commute');
  const displayDistance = estimate?.distanceText || preference?.distanceText;

  const tooltipTitle = originName && destName
    ? `${originName} → ${destName}\n${displayTime}${displayDistance ? ` (${displayDistance})` : ''}\nClick to change travel mode or edit time`
    : 'Commute between stops (click to customize)';

  return (
    <div className="planner-commute-bridge">
      <div className="commute-bridge-track" aria-hidden="true" />

      <div className="commute-bridge-pill-wrap">
        <button
          type="button"
          className={`commute-bridge-pill ${isLoading ? 'commute-bridge-pill--loading' : ''}`}
          onClick={onOpenCommute}
          title={tooltipTitle}
          aria-label={tooltipTitle}
        >
          <span className="commute-bridge-emoji" aria-hidden="true">
            {displayEmoji}
          </span>
          <span className="commute-bridge-time">
            {displayTime}
          </span>
        </button>

        {displayDistance ? (
          <span className="commute-bridge-dist" title={`Distance: ${displayDistance}`}>
            {displayDistance}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="commute-bridge-add-btn"
        onClick={onInsert}
        title="Insert stop here"
        aria-label="Insert stop here"
      >
        +
      </button>
    </div>
  );
}
