import { PlannerState } from '../types';

const STORAGE_KEY = 'itinerary-studio:v1';

export function loadPlannerState() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlannerState>;
    if (parsed.version !== 1) {
      return null;
    }

    return parsed as PlannerState;
  } catch {
    return null;
  }
}

export function savePlannerState(state: PlannerState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPlannerState() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
