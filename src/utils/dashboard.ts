import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import {
  CellValue,
  CellType,
  DateRow,
  getCellAddress,
  getCellLocation,
  getCellPhoto,
  getCellText,
  PackingItem,
  PlannerCellMap,
  PlannerCommuteMap,
  resolveCellType
} from '../types';
import { estimateCommuteFallback, formatDistance, formatDuration, haversineDistanceKm } from './commute';

export interface DayStayInfo {
  rowKey: string;
  dayLabel: string;
  weekday: string;
  stayName: string;
  cellValue?: CellValue;
  isInherited: boolean;
  isCheckIn: boolean;
  isCheckOutNext: boolean;
  hasStay: boolean;
  address?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number };
}

export interface UniqueStayInfo {
  id: string;
  name: string;
  nights: number;
  checkInDate: string;
  checkInDayLabel: string;
  checkOutDate: string;
  checkOutDayLabel: string;
  dateKeys: string[];
  cellValue?: CellValue;
  photoUrl?: string;
  address?: string;
  location?: { lat: number; lng: number };
}

export interface StayCalculationResult {
  dailyStays: Record<string, DayStayInfo>;
  uniqueStays: UniqueStayInfo[];
  missingStayDays: DateRow[];
  totalNights: number;
}

export interface TripCountdownResult {
  statusText: string;
  badgeState: 'upcoming' | 'active' | 'completed' | 'unknown';
  daysDiff: number;
}

export interface DayStopSummary {
  slotId: string;
  type: CellType;
  name: string;
  photoUrl?: string;
  address?: string;
  location?: { lat: number; lng: number };
}

export interface DayTransitSegment {
  fromName: string;
  toName: string;
  mode: string;
  durationText?: string;
  distanceText?: string;
}

export interface DayOverview {
  row: DateRow;
  dayIndex: number;
  stay: DayStayInfo;
  stops: DayStopSummary[];
  transits: DayTransitSegment[];
  pace: 'Relaxed' | 'Moderate' | 'Packed';
  totalStops: number;
}

export interface TripAnalyticsResult {
  totalDays: number;
  totalNights: number;
  totalStops: number;
  totalPlaces: number;
  totalPoints: number;
  totalTravelStops: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  formattedDistance: string;
  formattedDuration: string;
  staysCoveragePercent: number;
}

export const DEFAULT_PACKING_ITEMS: PackingItem[] = [
  { id: 'pack-1', text: 'Passport / Travel ID & Visas', done: false, category: 'Documents' },
  { id: 'pack-2', text: 'Flight Tickets & Booking Confirmations', done: false, category: 'Documents' },
  { id: 'pack-3', text: 'Travel Insurance Details', done: false, category: 'Documents' },
  { id: 'pack-4', text: 'Phone, Laptop & Watch Chargers', done: false, category: 'Electronics' },
  { id: 'pack-5', text: 'Universal Power Adapter & Power Bank', done: false, category: 'Electronics' },
  { id: 'pack-6', text: 'Headphones / Earbuds', done: false, category: 'Electronics' },
  { id: 'pack-7', text: 'Credit / Debit Cards & Local Currency', done: false, category: 'Finance' },
  { id: 'pack-8', text: 'Comfortable Walking Shoes & Outfits', done: false, category: 'Clothing' },
  { id: 'pack-9', text: 'Prescription Medicines & First Aid Kit', done: false, category: 'Health' },
  { id: 'pack-10', text: 'Sunscreen, Sunglasses & Hat', done: false, category: 'Essentials' },
  { id: 'pack-11', text: 'Toiletry Kit & Sanitizer', done: false, category: 'Essentials' },
  { id: 'pack-12', text: 'Light Rain Jacket or Umbrella', done: false, category: 'Essentials' }
];

/**
 * Calculates day-by-day accommodations and groups them into unique stays
 */
export function calculateStayDetails(
  dateRows: DateRow[],
  rowOrders: Record<string, string[]>,
  cells: PlannerCellMap,
  cellTypes: Record<string, CellType>
): StayCalculationResult {
  const dailyStays: Record<string, DayStayInfo> = {};
  let currentStayName = '';
  let currentStayValue: CellValue | undefined = undefined;

  // First pass: identify the accommodation for each day
  for (let i = 0; i < dateRows.length; i++) {
    const row = dateRows[i];
    const order = rowOrders[row.key] ?? [];
    const rowCells = cells[row.key] ?? {};

    // Find the last place in this date row
    let lastPlaceValue: CellValue | undefined = undefined;

    for (let j = order.length - 1; j >= 0; j--) {
      const slotId = order[j];
      const val = rowCells[slotId];
      if (!val) continue;

      const text = getCellText(val).trim();
      if (!text) continue;

      const cType = resolveCellType(slotId, cellTypes);
      // 'place' cells (purple) represent hotels / stays
      if (cType === 'place') {
        lastPlaceValue = val;
        break;
      }
    }

    if (lastPlaceValue) {
      currentStayName = getCellText(lastPlaceValue).trim();
      currentStayValue = lastPlaceValue;
      dailyStays[row.key] = {
        rowKey: row.key,
        dayLabel: row.label,
        weekday: row.weekday,
        stayName: currentStayName,
        cellValue: currentStayValue,
        isInherited: false,
        isCheckIn: false,
        isCheckOutNext: false,
        hasStay: true,
        address: getCellAddress(currentStayValue),
        photoUrl: getCellPhoto(currentStayValue),
        location: getCellLocation(currentStayValue)
      };
    } else if (currentStayName) {
      // Inherited from previous day
      dailyStays[row.key] = {
        rowKey: row.key,
        dayLabel: row.label,
        weekday: row.weekday,
        stayName: currentStayName,
        cellValue: currentStayValue,
        isInherited: true,
        isCheckIn: false,
        isCheckOutNext: false,
        hasStay: true,
        address: getCellAddress(currentStayValue),
        photoUrl: getCellPhoto(currentStayValue),
        location: getCellLocation(currentStayValue)
      };
    } else {
      // No place set yet
      dailyStays[row.key] = {
        rowKey: row.key,
        dayLabel: row.label,
        weekday: row.weekday,
        stayName: '',
        cellValue: undefined,
        isInherited: false,
        isCheckIn: false,
        isCheckOutNext: false,
        hasStay: false
      };
    }
  }

  // Second pass: determine check-ins, check-outs, and missing days
  const missingStayDays: DateRow[] = [];
  for (let i = 0; i < dateRows.length; i++) {
    const row = dateRows[i];
    const curr = dailyStays[row.key];
    const prev = i > 0 ? dailyStays[dateRows[i - 1].key] : null;
    const next = i < dateRows.length - 1 ? dailyStays[dateRows[i + 1].key] : null;

    if (!curr.hasStay) {
      missingStayDays.push(row);
    } else {
      // It's a check-in if there was no previous stay or it's a different hotel
      if (!prev || !prev.hasStay || prev.stayName !== curr.stayName) {
        curr.isCheckIn = true;
      }
      // It's a check-out next day if tomorrow is a different hotel or trip ends
      if (!next || !next.hasStay || next.stayName !== curr.stayName) {
        curr.isCheckOutNext = true;
      }
    }
  }

  // Third pass: group into unique stays
  const uniqueStays: UniqueStayInfo[] = [];
  let activeStayGroup: UniqueStayInfo | null = null;

  for (let i = 0; i < dateRows.length; i++) {
    const row = dateRows[i];
    const curr = dailyStays[row.key];

    if (!curr.hasStay) {
      if (activeStayGroup) {
        uniqueStays.push(activeStayGroup);
        activeStayGroup = null;
      }
      continue;
    }

    if (!activeStayGroup || activeStayGroup.name !== curr.stayName) {
      if (activeStayGroup) {
        uniqueStays.push(activeStayGroup);
      }
      activeStayGroup = {
        id: `stay-${curr.stayName}-${row.key}`,
        name: curr.stayName,
        nights: 1,
        checkInDate: row.key,
        checkInDayLabel: row.label,
        checkOutDate: row.key,
        checkOutDayLabel: row.label,
        dateKeys: [row.key],
        cellValue: curr.cellValue,
        photoUrl: curr.photoUrl,
        address: curr.address,
        location: curr.location
      };
    } else {
      activeStayGroup.nights += 1;
      activeStayGroup.checkOutDate = row.key;
      activeStayGroup.checkOutDayLabel = row.label;
      activeStayGroup.dateKeys.push(row.key);
      if (!activeStayGroup.photoUrl && curr.photoUrl) activeStayGroup.photoUrl = curr.photoUrl;
      if (!activeStayGroup.address && curr.address) activeStayGroup.address = curr.address;
      if (!activeStayGroup.location && curr.location) activeStayGroup.location = curr.location;
    }
  }

  if (activeStayGroup) {
    uniqueStays.push(activeStayGroup);
  }

  const totalNights = Math.max(0, dateRows.length > 0 ? dateRows.length - 1 : 0);

  return {
    dailyStays,
    uniqueStays,
    missingStayDays,
    totalNights
  };
}

/**
 * Calculates countdown or live status of the trip
 */
export function calculateTripCountdown(startDate: string, endDate: string): TripCountdownResult {
  if (!startDate || !endDate) {
    return { statusText: 'Dates not set', badgeState: 'unknown', daysDiff: 0 };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const today = new Date();

  if (!isValid(start) || !isValid(end)) {
    return { statusText: 'Invalid dates', badgeState: 'unknown', daysDiff: 0 };
  }

  const daysToStart = differenceInCalendarDays(start, today);
  const daysToEnd = differenceInCalendarDays(end, today);

  if (daysToStart > 0) {
    if (daysToStart === 1) {
      return { statusText: '✈️ Starts tomorrow', badgeState: 'upcoming', daysDiff: 1 };
    }
    return { statusText: `✈️ Starts in ${daysToStart} days`, badgeState: 'upcoming', daysDiff: daysToStart };
  }

  if (daysToEnd >= 0) {
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const currentDay = Math.abs(daysToStart) + 1;
    return {
      statusText: `🎉 Trip in progress (Day ${Math.min(currentDay, totalDays)} of ${totalDays})`,
      badgeState: 'active',
      daysDiff: 0
    };
  }

  return { statusText: '🏁 Trip completed', badgeState: 'completed', daysDiff: Math.abs(daysToEnd) };
}

/**
 * Computes day by day itinerary overview
 */
export function buildDayOverviews(
  dateRows: DateRow[],
  rowOrders: Record<string, string[]>,
  cells: PlannerCellMap,
  cellTypes: Record<string, CellType>,
  commutes: PlannerCommuteMap = {},
  dailyStays: Record<string, DayStayInfo>
): DayOverview[] {
  return dateRows.map((row, index) => {
    const order = rowOrders[row.key] ?? [];
    const rowCells = cells[row.key] ?? {};
    const stops: DayStopSummary[] = [];
    const transits: DayTransitSegment[] = [];

    for (let i = 0; i < order.length; i++) {
      const slotId = order[i];
      const val = rowCells[slotId];
      const text = getCellText(val).trim();
      if (!text) continue;

      const type = resolveCellType(slotId, cellTypes);
      stops.push({
        slotId,
        type,
        name: text,
        photoUrl: getCellPhoto(val),
        address: getCellAddress(val),
        location: getCellLocation(val)
      });

      // Commute from previous stop
      if (i > 0) {
        const prevSlotId = order[i - 1];
        const prevVal = rowCells[prevSlotId];
        const prevText = getCellText(prevVal).trim();
        const segmentKey = `${row.key}:${prevSlotId}->${slotId}`;
        const commutePref = commutes[segmentKey];

        const prevLoc = getCellLocation(prevVal);
        const currLoc = getCellLocation(val);

        let durationText = commutePref?.durationText;
        let distanceText = commutePref?.distanceText;
        const mode = commutePref?.mode || 'DRIVING';

        if ((!durationText || !distanceText) && prevLoc && currLoc) {
          const est = estimateCommuteFallback(prevLoc, currLoc, mode);
          durationText = durationText || est.durationText;
          distanceText = distanceText || est.distanceText;
        }

        transits.push({
          fromName: prevText,
          toName: text,
          mode,
          durationText,
          distanceText
        });
      }
    }

    let pace: 'Relaxed' | 'Moderate' | 'Packed' = 'Relaxed';
    if (stops.length >= 5) {
      pace = 'Packed';
    } else if (stops.length >= 3) {
      pace = 'Moderate';
    }

    return {
      row,
      dayIndex: index + 1,
      stay: dailyStays[row.key] || {
        rowKey: row.key,
        dayLabel: row.label,
        weekday: row.weekday,
        stayName: '',
        isInherited: false,
        isCheckIn: false,
        isCheckOutNext: false,
        hasStay: false
      },
      stops,
      transits,
      pace,
      totalStops: stops.length
    };
  });
}

/**
 * Computes high-level analytics for the entire trip
 */
export function calculateTripAnalytics(
  dateRows: DateRow[],
  rowOrders: Record<string, string[]>,
  cells: PlannerCellMap,
  cellTypes: Record<string, CellType>,
  commutes: PlannerCommuteMap = {},
  stayResult: StayCalculationResult
): TripAnalyticsResult {
  let totalPlaces = 0;
  let totalPoints = 0;
  let totalTravelStops = 0;
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;

  for (let rowIndex = 0; rowIndex < dateRows.length; rowIndex++) {
    const row = dateRows[rowIndex];
    const order = rowOrders[row.key] ?? [];
    const rowCells = cells[row.key] ?? {};

    for (let i = 0; i < order.length; i++) {
      const slotId = order[i];
      const val = rowCells[slotId];
      if (!val || !getCellText(val).trim()) continue;

      const type = resolveCellType(slotId, cellTypes);
      if (type === 'place') totalPlaces++;
      else if (type === 'point') totalPoints++;
      else if (type === 'travelling') totalTravelStops++;

      if (i > 0) {
        const prevSlotId = order[i - 1];
        const prevVal = rowCells[prevSlotId];
        const segmentKey = `${row.key}:${prevSlotId}->${slotId}`;
        const commutePref = commutes[segmentKey];

        const prevLoc = getCellLocation(prevVal);
        const currLoc = getCellLocation(val);

        if (commutePref?.distanceText && commutePref.distanceText.includes('km')) {
          const num = parseFloat(commutePref.distanceText);
          if (!isNaN(num)) totalDistanceKm += num;
        } else if (prevLoc && currLoc) {
          const straight = haversineDistanceKm(prevLoc.lat, prevLoc.lng, currLoc.lat, currLoc.lng);
          totalDistanceKm += straight * 1.3;
        }

        if (commutePref?.durationText) {
          const match = commutePref.durationText.match(/(\d+)\s*(hr|hour|min)/gi);
          if (match) {
            let mins = 0;
            for (const m of match) {
              if (m.toLowerCase().includes('hr') || m.toLowerCase().includes('hour')) {
                mins += parseInt(m, 10) * 60;
              } else if (m.toLowerCase().includes('min')) {
                mins += parseInt(m, 10);
              }
            }
            totalDurationMinutes += mins;
          }
        } else if (prevLoc && currLoc) {
          const est = estimateCommuteFallback(prevLoc, currLoc);
          totalDurationMinutes += Math.round(est.durationSeconds / 60);
        }
      }
    }
  }

  const totalDays = dateRows.length;
  const totalNights = stayResult.totalNights;
  const daysWithStay = totalDays - stayResult.missingStayDays.length;
  const staysCoveragePercent = totalDays > 0 ? Math.round((daysWithStay / totalDays) * 100) : 100;

  return {
    totalDays,
    totalNights,
    totalStops: totalPlaces + totalPoints + totalTravelStops,
    totalPlaces,
    totalPoints,
    totalTravelStops,
    totalDistanceKm,
    totalDurationMinutes,
    formattedDistance: totalDistanceKm > 0 ? formatDistance(totalDistanceKm) : '0 km',
    formattedDuration: totalDurationMinutes > 0 ? formatDuration(totalDurationMinutes) : '0 min',
    staysCoveragePercent
  };
}
