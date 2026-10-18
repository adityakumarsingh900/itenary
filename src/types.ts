export type CellType = 'travelling' | 'point' | 'place';

export type PlannerColumn = {
  id: string;
  title: string;
  emoji: string;
  color: string;
};

export type CommuteMode = 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING';

export type CellData = {
  text: string;
  photoUrl?: string;
  address?: string;
  placeId?: string;
  location?: { lat: number; lng: number };
  commuteMode?: CommuteMode;
  commuteDistance?: string;
  originName?: string;
  destinationName?: string;
};

export type CellValue = string | CellData;

export type PlannerCellMap = Record<string, Record<string, CellValue>>;

export type PlannerRowOrderMap = Record<string, string[]>;

export type PlannerCellTypeMap = Record<string, CellType>;

export type CommuteSegmentData = {
  mode: CommuteMode;
  customText?: string;
  durationText?: string;
  distanceText?: string;
  note?: string;
};

export type PlannerCommuteMap = Record<string, CommuteSegmentData>;

export type PlannerState = {
  version: 1;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  columns: PlannerColumn[];
  cells: PlannerCellMap;
  rowOrders: PlannerRowOrderMap;
  cellTypes?: PlannerCellTypeMap;
  commutes?: PlannerCommuteMap;
};

export type DateRow = {
  key: string;
  label: string;
  weekday: string;
};

export function resolveCellType(slotId: string, cellTypes?: Record<string, CellType>): CellType {
  if (cellTypes && cellTypes[slotId]) {
    return cellTypes[slotId];
  }
  if (slotId.startsWith('travelling') || slotId.startsWith('travel')) {
    return 'travelling';
  }
  if (slotId.startsWith('place')) {
    return 'place';
  }
  if (slotId.startsWith('point')) {
    return 'point';
  }
  return 'point';
}

export function getCellText(value?: CellValue | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.text || '';
}

export function getCellPhoto(value?: CellValue | null): string | undefined {
  if (!value || typeof value === 'string') return undefined;
  return value.photoUrl || undefined;
}

export function getCellAddress(value?: CellValue | null): string | undefined {
  if (!value || typeof value === 'string') return undefined;
  return value.address || undefined;
}

export function getCellLocation(value?: CellValue | null): { lat: number; lng: number } | undefined {
  if (!value || typeof value === 'string') return undefined;
  return value.location || undefined;
}

export function normalizeCellValue(value?: CellValue | null): CellData {
  if (!value) return { text: '' };
  if (typeof value === 'string') return { text: value };
  return value;
}

