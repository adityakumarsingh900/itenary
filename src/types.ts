export type CellType = 'travelling' | 'point' | 'place';

export type PlannerColumn = {
  id: string;
  title: string;
  emoji: string;
  color: string;
};

export type PlannerCellMap = Record<string, Record<string, string>>;

export type PlannerRowOrderMap = Record<string, string[]>;

export type PlannerCellTypeMap = Record<string, CellType>;

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
