import { useEffect, useState } from 'react';
import { CellData, CellValue, CommuteMode, getCellText, normalizeCellValue } from '../types';
import {
  calculateCommute,
  CommuteEstimate,
  getCommuteModeEmoji,
  getCommuteModeLabel
} from '../utils/commute';

interface CommuteModalContentProps {
  initialValue: CellValue;
  origin?: CellValue;
  destination?: CellValue;
  onSave: (value: CellValue) => void;
  onCancel: () => void;
}

const MODES: CommuteMode[] = ['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING'];

export function CommuteModalContent({
  initialValue,
  origin,
  destination,
  onSave,
  onCancel
}: CommuteModalContentProps) {
  const normalizedInitial = normalizeCellValue(initialValue);
  const [commuteText, setCommuteText] = useState(normalizedInitial.text || '');
  const [selectedMode, setSelectedMode] = useState<CommuteMode>(
    normalizedInitial.commuteMode || 'DRIVING'
  );
  const [distanceText, setDistanceText] = useState<string | undefined>(
    normalizedInitial.commuteDistance
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [isEstimate, setIsEstimate] = useState(false);

  const originName = origin ? getCellText(origin) : normalizedInitial.originName || '';
  const destinationName = destination ? getCellText(destination) : normalizedInitial.destinationName || '';

  // Auto-calculate on mount if origin and destination are known
  useEffect(() => {
    let isMounted = true;

    async function compute(mode: CommuteMode) {
      if (!origin || !destination) {
        return;
      }

      setIsCalculating(true);
      const res = await calculateCommute(origin, destination, mode);
      if (isMounted && res) {
        setCommuteText(res.durationText);
        setDistanceText(res.distanceText);
        setIsEstimate(res.isEstimate);
      }
      if (isMounted) {
        setIsCalculating(false);
      }
    }

    // Only auto-compute if current text is empty or matches previous estimate
    if (!commuteText || !normalizedInitial.text) {
      compute(selectedMode);
    }
  }, [origin, destination]);

  const handleModeChange = async (mode: CommuteMode) => {
    setSelectedMode(mode);
    if (!origin || !destination) {
      return;
    }

    setIsCalculating(true);
    const res = await calculateCommute(origin, destination, mode);
    if (res) {
      setCommuteText(res.durationText);
      setDistanceText(res.distanceText);
      setIsEstimate(res.isEstimate);
    }
    setIsCalculating(false);
  };

  const handleSave = () => {
    const finalData: CellData = {
      text: commuteText.trim() || 'Commute',
      commuteMode: selectedMode,
      commuteDistance: distanceText,
      originName: originName || undefined,
      destinationName: destinationName || undefined
    };
    onSave(finalData);
  };

  return (
    <div className="commute-modal-container">
      {/* Route Context Banner */}
      {originName || destinationName ? (
        <div className="commute-route-card">
          <div className="commute-route-point">
            <span className="commute-route-dot commute-route-dot--origin" />
            <div className="commute-route-text">
              <span className="commute-route-sub">From</span>
              <strong>{originName || 'Previous stop'}</strong>
            </div>
          </div>

          <div className="commute-route-connector">
            <span className="commute-route-line" />
            <span className="commute-route-badge">
              {getCommuteModeEmoji(selectedMode)} {distanceText ? `• ${distanceText}` : ''}
            </span>
          </div>

          <div className="commute-route-point">
            <span className="commute-route-dot commute-route-dot--dest" />
            <div className="commute-route-text">
              <span className="commute-route-sub">To</span>
              <strong>{destinationName || 'Next stop'}</strong>
            </div>
          </div>
        </div>
      ) : (
        <p className="commute-modal-hint">
          Set the expected travel time for this commute.
        </p>
      )}

      {/* Mode Selector */}
      <div className="commute-mode-selector">
        <span className="commute-section-label">Travel mode</span>
        <div className="commute-mode-buttons">
          {MODES.map((mode) => {
            const isActive = selectedMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`commute-mode-btn ${isActive ? 'commute-mode-btn--active' : ''}`}
                onClick={() => handleModeChange(mode)}
                disabled={isCalculating}
              >
                <span className="commute-mode-emoji">{getCommuteModeEmoji(mode)}</span>
                <span className="commute-mode-label">{getCommuteModeLabel(mode)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Commute Time Input & Status */}
      <div className="commute-input-section">
        <label className="commute-input-label">
          <span>Commute duration / label</span>
          {isCalculating ? (
            <span className="commute-status-tag commute-status-tag--calc">Calculating... ⏳</span>
          ) : isEstimate ? (
            <span className="commute-status-tag commute-status-tag--est" title="Distance-based estimate">
              Estimated 📏
            </span>
          ) : distanceText ? (
            <span className="commute-status-tag commute-status-tag--live">
              {distanceText}
            </span>
          ) : null}
        </label>

        <div className="commute-input-wrapper">
          <input
            className="cell-modal-input cell-modal-input--travelling"
            autoFocus
            value={commuteText}
            onChange={(e) => setCommuteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
            placeholder="e.g. 15 mins, 1 hr, Take subway"
          />
        </div>

        {origin && destination ? (
          <button
            type="button"
            className="commute-recalc-btn"
            onClick={() => handleModeChange(selectedMode)}
            disabled={isCalculating}
          >
            🔄 Recalculate route
          </button>
        ) : null}
      </div>

      {/* Modal Actions */}
      <div className="cell-modal-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={handleSave}
          disabled={!commuteText.trim() || isCalculating}
        >
          Save commute
        </button>
      </div>
    </div>
  );
}
