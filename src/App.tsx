import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  closestCorners,
  pointerWithin,
  CollisionDetection,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addDaysInputValue, adjustEndDate, adjustStartDate, buildDateRows, normalizeDateRange, todayInputValue } from './utils/date';
import { clearPlannerState, loadPlannerState, savePlannerState } from './utils/storage';
import {
  CellData,
  CellType,
  CellValue,
  CommuteMode,
  DateRow,
  DestinationData,
  getCellAddress,
  getCellLocation,
  getCellPhoto,
  getCellText,
  normalizeCellValue,
  PlannerCellMap,
  PlannerColumn,
  PlannerCommuteMap,
  CommuteSegmentData,
  PlannerState,
  resolveCellType
} from './types';
import { PlaceSearchModalContent } from './components/PlaceSearchModalContent';
import { CommuteModalContent } from './components/CommuteModalContent';
import { CommuteBridge } from './components/CommuteBridge';
import { DayCommuteCell } from './components/DayCommuteCell';
import { DestinationAutocomplete } from './components/DestinationAutocomplete';
import {
  calculateCommute,
  findFirstContentCell,
  findLastContentCell,
  getCommuteModeEmoji
} from './utils/commute';
import { geocodeDestination, isGoogleMapsConfigured, loadGooglePlacesScript } from './utils/googlePlaces';

type PageMode = 'setup' | 'planner';

const defaultColumns: PlannerColumn[] = [];

const columnTemplates = [
  { title: 'Food Stops', emoji: '🍜', color: '' },
  { title: 'Transport', emoji: '🚌', color: '' },
  { title: 'Notes', emoji: '📝', color: '' },
  { title: 'Views', emoji: '📸', color: '' }
];

function isSharedSlotId(slotId: string) {
  return ['slot-1', 'slot-2', 'slot-3'].includes(slotId);
}

function getDefaultRowOrder(_rowKey?: string): string[] {
  return [];
}

function buildRowOrders(rowKeys: string[], existing?: Record<string, string[]>) {
  return rowKeys.reduce<Record<string, string[]>>((accumulator, rowKey) => {
    const previous = existing?.[rowKey];
    accumulator[rowKey] =
      previous !== undefined
        ? previous.map((slotId) => (isSharedSlotId(slotId) ? `${slotId}-${rowKey}` : slotId))
        : [];
    return accumulator;
  }, {});
}

function normalizePlannerState(state: PlannerState): {
  rowOrders: Record<string, string[]>;
  cells: PlannerCellMap;
  cellTypes: Record<string, CellType>;
} {
  const rowOrders: Record<string, string[]> = {};
  const cells: PlannerCellMap = {};
  const cellTypes: Record<string, CellType> = {};

  for (const [rowKey, order] of Object.entries(state.rowOrders ?? {})) {
    const rowCells = state.cells?.[rowKey] ?? {};
    const nextOrder: string[] = [];
    const nextRowCells: Record<string, CellValue> = {};

    for (const slotId of order) {
      if (slotId.startsWith('travelling') || slotId.startsWith('travel')) {
        continue;
      }
      const isDefaultSlot = isSharedSlotId(slotId) || slotId.startsWith('slot-');
      const uniqueSlotId = isSharedSlotId(slotId) ? `${slotId}-${rowKey}` : slotId;
      const val = rowCells[slotId] ?? rowCells[uniqueSlotId] ?? '';
      const textVal = getCellText(val);

      // Skip empty initial default template slots so plans start clean with no cells
      if (isDefaultSlot && !textVal) {
        continue;
      }

      nextOrder.push(uniqueSlotId);
      cellTypes[uniqueSlotId] = resolveCellType(uniqueSlotId, state.cellTypes);
      if (textVal) {
        nextRowCells[uniqueSlotId] = val;
      }
    }

    rowOrders[rowKey] = nextOrder;
    if (Object.keys(nextRowCells).length > 0) {
      cells[rowKey] = nextRowCells;
    }
  }

  return { rowOrders, cells, cellTypes };
}

function getCellId(slotId: string) {
  return `cell:${slotId}`;
}

function parseCellId(id: string) {
  if (!id.startsWith('cell:')) {
    return null;
  }
  return id.replace('cell:', '');
}

function findRowKey(id: string, orders: Record<string, string[]>): string | null {
  if (id.startsWith('row:')) {
    return id.replace('row:', '');
  }

  const slotId = id.startsWith('cell:') ? id.replace('cell:', '') : id;

  for (const [rowKey, order] of Object.entries(orders)) {
    if (order.includes(slotId)) {
      return rowKey;
    }
  }

  return null;
}

function createFreshState(): PlannerState {
  const startDate = todayInputValue();
  const endDate = addDaysInputValue(startDate, 4);
  const rows = buildDateRows(startDate, endDate);
  const initialRowOrders: Record<string, string[]> = {};

  for (const row of rows) {
    initialRowOrders[row.key] = [];
  }

  return {
    version: 1,
    tripName: 'Bali, Indonesia',
    destination: 'Bali, Indonesia',
    destinationData: {
      name: 'Bali, Indonesia',
      formattedAddress: 'Bali, Indonesia',
      location: { lat: -8.409518, lng: 115.188916 },
      viewport: { north: -8.0, south: -8.9, east: 115.8, west: 114.4 },
      photoUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=800&q=80',
      placeId: 'demo-dest-bali'
    },
    startDate,
    endDate,
    columns: defaultColumns,
    cells: {},
    rowOrders: initialRowOrders
  };
}

function makeColumnFromTemplate(index: number): PlannerColumn {
  const template = columnTemplates[index % columnTemplates.length];
  return {
    id: `${template.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${index}`,
    title: template.title,
    emoji: template.emoji,
    color: template.color
  };
}

function SortableColumnHeader({
  column,
  onRename,
  onRemove
}: {
  column: PlannerColumn;
  onRename: (value: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });

  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1
      }}
      className="planner-th planner-th--dynamic"
    >
      <div className="planner-column-header">
        <button className="drag-handle" type="button" aria-label={`Drag ${column.title}`} {...attributes} {...listeners}>
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="column-emoji" aria-hidden="true">
          {column.emoji || '\u00A0'}
        </span>
        <input
          className={`column-title-input ${column.title ? '' : 'column-title-input--blank'}`}
          value={column.title}
          onChange={(event) => onRename(event.target.value)}
          aria-label={column.title ? `${column.title} column name` : 'Unnamed column'}
          placeholder=""
        />
        <button className="icon-button" type="button" onClick={onRemove} aria-label={`Remove ${column.title}`}>
          ×
        </button>
      </div>
    </th>
  );
}

function DraggableEditableCell({
  slotId,
  value,
  type,
  onOpenEdit,
  onDelete
}: {
  slotId: string;
  value: CellValue;
  type: CellType;
  onOpenEdit: () => void;
  onDelete: () => void;
}) {
  const cellId = getCellId(slotId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cellId });
  const text = getCellText(value);
  const photoUrl = type !== 'travelling' ? getCellPhoto(value) : undefined;
  const address = type !== 'travelling' ? getCellAddress(value) : undefined;
  const hasValue = Boolean(text);

  return (
    <div
      ref={setNodeRef}
      className={`planner-cell-card planner-cell-card--${type} ${hasValue ? 'planner-cell-card--filled' : 'planner-cell-card--empty'} ${photoUrl ? 'planner-cell-card--has-photo' : ''} ${isDragging ? 'planner-cell-card--dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1
      }}
    >
      <button
        className="cell-drag-handle"
        type="button"
        aria-label="Drag cell"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div
        className={`planner-cell-content planner-cell-content--${type} ${hasValue ? 'planner-cell-content--filled' : 'planner-cell-content--empty'} ${photoUrl ? 'planner-cell-content--has-photo' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={
          type === 'travelling'
            ? text ? `Commute: ${text}` : 'Add commute time'
            : type === 'place'
            ? text ? `Place: ${text}` : 'Add place'
            : text ? `Point: ${text}` : 'Add point'
        }
        onClick={onOpenEdit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenEdit();
          }
        }}
      >
        {type === 'travelling' ? (
          <>
            <div className="travelling-icon-wrap" aria-hidden="true">
              <span className="travelling-emoji-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>
                {typeof value === 'object' && value.commuteMode
                  ? getCommuteModeEmoji(value.commuteMode)
                  : '🚗'}
              </span>
            </div>
            <div className="travelling-value-text">
              {text || 'add commute time'}
            </div>
          </>
        ) : photoUrl ? (
          <div className="place-cell-card-layout">
            <div className="place-cell-thumb-wrap">
              <img src={photoUrl} alt="" className="place-cell-thumb" loading="lazy" />
              <div className="place-cell-thumb-gradient" />
            </div>
            <div className="place-cell-details">
              <div className="place-cell-text">{text}</div>
              {address ? <div className="place-cell-subtext">{address}</div> : null}
            </div>
          </div>
        ) : (
          text || (type === 'place' ? 'Add place' : 'Add point')
        )}
      </div>
      <button
        className="cell-delete-button"
        type="button"
        aria-label="Delete note"
        title="Delete note"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>
  );
}

function DragPreviewCard({ value, type }: { value: CellValue; type: CellType }) {
  const text = getCellText(value);
  const photoUrl = type !== 'travelling' ? getCellPhoto(value) : undefined;
  const address = type !== 'travelling' ? getCellAddress(value) : undefined;

  return (
    <div className={`planner-cell-card planner-cell-card--drag-overlay planner-cell-card--${type} ${photoUrl ? 'planner-cell-card--has-photo' : ''}`}>
      <div className="cell-drag-handle">⠿</div>
      {type === 'travelling' ? (
        <div className="planner-cell-content planner-cell-content--travelling planner-cell-content--filled">
          <div className="travelling-icon-wrap" aria-hidden="true">
            <span className="travelling-emoji-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>
              {typeof value === 'object' && value.commuteMode
                ? getCommuteModeEmoji(value.commuteMode)
                : '🚗'}
            </span>
          </div>
          <div className="travelling-value-text">{text || 'add commute time'}</div>
        </div>
      ) : photoUrl ? (
        <div className="place-cell-card-layout">
          <div className="place-cell-thumb-wrap">
            <img src={photoUrl} alt="" className="place-cell-thumb" />
            <div className="place-cell-thumb-gradient" />
          </div>
          <div className="place-cell-details">
            <div className="place-cell-text">{text}</div>
            {address ? <div className="place-cell-subtext">{address}</div> : null}
          </div>
        </div>
      ) : (
        <div className={`planner-cell-content planner-cell-content--filled planner-cell-content--${type}`}>
          {text || (type === 'place' ? 'Add place' : 'Add point')}
        </div>
      )}
    </div>
  );
}

function AddCellButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="planner-cell-add" type="button" onClick={onClick} aria-label="Add new cell">
      <span aria-hidden="true">+</span>
    </button>
  );
}

function InsertCellDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="planner-cell-divider">
      <button
        type="button"
        className="cell-insert-button"
        onClick={onClick}
        title="Insert activity or commute here"
        aria-label="Insert activity or commute here"
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

function DroppablePlannerRow({
  rowKey,
  children
}: {
  rowKey: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${rowKey}` });

  return (
    <section ref={setNodeRef} className={`planner-row ${isOver ? 'planner-row--over' : ''}`}>
      {children}
    </section>
  );
}

function SetupPage({
  destination,
  setDestination,
  destinationData,
  setDestinationData,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onContinue
}: {
  destination: string;
  setDestination: (value: string) => void;
  destinationData?: DestinationData;
  setDestinationData: (data?: DestinationData) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="setup-card hero-card">
        <div>
          <span className="eyebrow">Itinerary Studio</span>
          <h1>Plan a brighter trip, one day at a time.</h1>
          <p className="hero-copy">
            Start with your destination and travel dates. We’ll build a clean, colorful planning table on the next
            screen.
          </p>

          <div className="setup-highlights">
            <div className="stat-card">
              <strong>2 steps</strong>
              <span>destination, then planning</span>
            </div>
            <div className="stat-card">
              <strong>Sticky</strong>
              <span>dates stay fixed on the left</span>
            </div>
            <div className="stat-card">
              <strong>Vibrant</strong>
              <span>tourist-friendly, colorful UI</span>
            </div>
          </div>
        </div>

        <form
          className="setup-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (destination.trim()) {
              onContinue();
            }
          }}
        >
          <div className="setup-field-group">
            <label className="setup-field-label">
              <span>Destination</span>
            </label>
            <DestinationAutocomplete
              value={destination}
              destinationData={destinationData}
              onChange={(newDest, newData) => {
                setDestination(newDest);
                if (newData !== undefined) {
                  setDestinationData(newData);
                }
              }}
            />
          </div>

          <label>
            From
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            To
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <button
            className="primary-button setup-continue-button"
            type="submit"
            disabled={!destination.trim()}
          >
            Continue to planner
          </button>
        </form>
      </section>
    </main>
  );
}

function PlannerPage({
  tripName,
  destination,
  destinationData,
  startDate,
  endDate,
  columns,
  rowOrders,
  cells,
  cellTypes,
  lastSavedAt,
  onBack,
  onTripReset,
  onTripNameChange,
  onStartDateChange,
  onEndDateChange,
  onAddColumn,
  onAddCell,
  onRenameColumn,
  onRemoveColumn,
  onCellChange,
  onDeleteCell,
  onRowOrdersChange,
  onCellsChange,
  onCellTypesChange,
  commutes,
  onCommutesChange
}: {
  tripName: string;
  destination: string;
  destinationData?: DestinationData;
  startDate: string;
  endDate: string;
  columns: PlannerColumn[];
  rowOrders: Record<string, string[]>;
  cells: PlannerCellMap;
  cellTypes: Record<string, CellType>;
  commutes?: PlannerCommuteMap;
  lastSavedAt: string | null;
  onBack: () => void;
  onTripReset: () => void;
  onTripNameChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onAddColumn: () => void;
  onAddCell: (rowKey: string, type: CellType, insertIndex?: number) => string;
  onRenameColumn: (columnId: string, value: string) => void;
  onRemoveColumn: (columnId: string) => void;
  onCellChange: (rowKey: string, columnId: string, value: CellValue) => void;
  onDeleteCell: (rowKey: string, slotId: string) => void;
  onRowOrdersChange: (orders: Record<string, string[]>) => void;
  onCellsChange: (cells: PlannerCellMap) => void;
  onCellTypesChange: (updater: (current: Record<string, CellType>) => Record<string, CellType>) => void;
  onCommutesChange: (updater: (current: PlannerCommuteMap) => PlannerCommuteMap) => void;
}) {
  const dateRows = useMemo<DateRow[]>(() => buildDateRows(startDate, endDate), [startDate, endDate]);
  const totalActivitiesCount = useMemo(() => {
    return Object.values(rowOrders).reduce((sum, order) => sum + order.length, 0);
  }, [rowOrders]);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ rowKey: string; insertIndex?: number } | null>(null);
  const [activeCommuteSegment, setActiveCommuteSegment] = useState<{
    rowKey: string;
    fromSlotId: string;
    toSlotId: string;
    fromValue: CellValue;
    toValue: CellValue;
    preference?: CommuteSegmentData;
    isDayCommute?: boolean;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    columnId: string;
    value: CellValue;
    type: CellType;
    isNew?: boolean;
  } | null>(null);
  const [cellToDelete, setCellToDelete] = useState<{ rowKey: string; slotId: string; value: CellValue } | null>(null);
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    slotId: string;
    value: CellValue;
    type: CellType;
  } | null>(null);

  const originalDragStateRef = useRef<{
    rowOrders: Record<string, string[]>;
    cells: PlannerCellMap;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const closeEditor = () => {
    if (editingCell?.isNew && !getCellText(editingCell.value).trim()) {
      onDeleteCell(editingCell.rowKey, editingCell.columnId);
    }
    setEditingCell(null);
  };

  const handleSelectCellType = (type: CellType) => {
    if (!pickerTarget) {
      return;
    }

    const { rowKey, insertIndex } = pickerTarget;
    const newSlotId = onAddCell(rowKey, type, insertIndex);
    setPickerTarget(null);

    setEditingCell({
      rowKey,
      columnId: newSlotId,
      value: '',
      type,
      isNew: true
    });
  };

  const saveEditorValue = (updatedValue?: CellValue) => {
    if (!editingCell) {
      return;
    }

    const valueToSave = updatedValue !== undefined ? updatedValue : editingCell.value;
    const { rowKey, columnId } = editingCell;

    onCellChange(rowKey, columnId, valueToSave);
    setEditingCell(null);
  };

  const handleConfirmDelete = () => {
    if (!cellToDelete) {
      return;
    }

    onDeleteCell(cellToDelete.rowKey, cellToDelete.slotId);
    if (editingCell && editingCell.rowKey === cellToDelete.rowKey && editingCell.columnId === cellToDelete.slotId) {
      setEditingCell(null);
    }
    setCellToDelete(null);
  };

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      const cellCollision = pointerCollisions.find((c) => String(c.id).startsWith('cell:'));
      if (cellCollision) {
        return [cellCollision];
      }
      return pointerCollisions;
    }

    const cornerCollisions = closestCorners(args);
    const cellCorner = cornerCollisions.find((c) => String(c.id).startsWith('cell:'));
    if (cellCorner) {
      return [cellCorner];
    }
    return cornerCollisions;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const slotId = parseCellId(activeId);
    if (!slotId) return;

    const rowKey = findRowKey(activeId, rowOrders);
    if (!rowKey) return;

    originalDragStateRef.current = {
      rowOrders: { ...rowOrders },
      cells: { ...cells }
    };

    setActiveDrag({
      id: activeId,
      slotId,
      value: cells[rowKey]?.[slotId] ?? '',
      type: resolveCellType(slotId, cellTypes)
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeSlotId = parseCellId(activeId);
    if (!activeSlotId) {
      return;
    }

    const sourceRowKey = findRowKey(activeId, rowOrders);
    const targetRowKey = findRowKey(overId, rowOrders);

    if (!sourceRowKey || !targetRowKey || sourceRowKey === targetRowKey) {
      return;
    }

    const sourceOrder = rowOrders[sourceRowKey] ?? [];
    const targetOrder = rowOrders[targetRowKey] ?? [];

    const activeIndex = sourceOrder.indexOf(activeSlotId);
    if (activeIndex === -1) {
      return;
    }

    let newIndex: number;
    if (overId.startsWith('row:')) {
      newIndex = targetOrder.length;
    } else {
      const overSlotId = parseCellId(overId);
      const overIndex = overSlotId ? targetOrder.indexOf(overSlotId) : -1;

      if (overIndex === -1) {
        newIndex = targetOrder.length;
      } else {
        const isAfter =
          event.active.rect.current.translated &&
          event.over &&
          event.active.rect.current.translated.left >
            event.over.rect.left + event.over.rect.width / 2;
        newIndex = isAfter ? overIndex + 1 : overIndex;
      }
    }

    const nextSourceOrder = sourceOrder.filter((id) => id !== activeSlotId);
    const nextTargetOrder = [...targetOrder];
    const clampedIndex = Math.max(0, Math.min(newIndex, nextTargetOrder.length));
    nextTargetOrder.splice(clampedIndex, 0, activeSlotId);

    onRowOrdersChange({
      ...rowOrders,
      [sourceRowKey]: nextSourceOrder,
      [targetRowKey]: nextTargetOrder
    });

    const sourceValue = cells[sourceRowKey]?.[activeSlotId] ?? '';
    const nextCells: PlannerCellMap = { ...cells };

    const nextSourceRow = { ...(nextCells[sourceRowKey] ?? {}) };
    delete nextSourceRow[activeSlotId];
    nextCells[sourceRowKey] = nextSourceRow;

    const nextTargetRow = { ...(nextCells[targetRowKey] ?? {}) };
    nextTargetRow[activeSlotId] = sourceValue;
    nextCells[targetRowKey] = nextTargetRow;

    onCellsChange(nextCells);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    originalDragStateRef.current = null;

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeSlotId = parseCellId(activeId);
    if (!activeSlotId) {
      return;
    }

    const currentRowKey = findRowKey(activeId, rowOrders);
    if (!currentRowKey) {
      return;
    }

    if (overId.startsWith('cell:')) {
      const overSlotId = parseCellId(overId);
      const overRowKey = findRowKey(overId, rowOrders);

      if (overSlotId && currentRowKey === overRowKey) {
        const order = rowOrders[currentRowKey] ?? [];
        const oldIndex = order.indexOf(activeSlotId);
        const newIndex = order.indexOf(overSlotId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          onRowOrdersChange({
            ...rowOrders,
            [currentRowKey]: arrayMove(order, oldIndex, newIndex)
          });
        }
      }
    }
  };

  const handleDragCancel = () => {
    if (originalDragStateRef.current) {
      onRowOrdersChange(originalDragStateRef.current.rowOrders);
      onCellsChange(originalDragStateRef.current.cells);
      originalDragStateRef.current = null;
    }
    setActiveDrag(null);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className={`planner-top-card hero-card ${overviewExpanded ? 'planner-top-card--expanded' : 'planner-top-card--compact'}`}>
        <div className="planner-top-summary">
          <span className="eyebrow">
            {destination ? `Trip overview • 📍 ${destination}` : 'Trip overview'}
          </span>
          <h1>{destination || tripName || 'Untitled trip'}</h1>
          <p className="hero-copy">
            {startDate && endDate
              ? `Planning from ${startDate} to ${endDate}`
              : 'Set your trip dates to generate rows in the table below.'}
          </p>
        </div>

        <div className="planner-top-actions">
          <button
            className="planner-overview-toggle secondary-button"
            type="button"
            onClick={() => setOverviewExpanded((current) => !current)}
          >
            {overviewExpanded ? 'Hide details' : 'Show details'}
          </button>

          <div className={`planner-top-details ${overviewExpanded ? 'planner-top-details--visible' : ''}`}>
            <div className="stat-card">
              <strong>{dateRows.length}</strong>
              <span>days planned</span>
            </div>
            <div className="stat-card">
              <strong>{totalActivitiesCount}</strong>
              <span>activities</span>
            </div>
            <div className="stat-card">
              <strong>{lastSavedAt ? 'Saved' : 'Ready'}</strong>
              <span>{lastSavedAt ? `Last saved at ${lastSavedAt}` : 'Autosave is on'}</span>
            </div>

            <div className="planner-action-row">
              <button className="secondary-button" type="button" onClick={onBack}>
                Edit trip details
              </button>
              <button className="secondary-button" type="button" onClick={onTripReset}>
                Reset planner
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="planner-card">
        <div className="planner-toolbar">
          <div>
            <h2>Your route list</h2>
            <p>Each date is a horizontal list. Drop one cell onto another to insert it and push the rest to the right.</p>
          </div>
          <span className="planner-note">Editable cells are saved locally in this browser.</span>
        </div>

        <div className="table-shell">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="planner-list">
              {dateRows.length > 0 ? (
                dateRows.map((row, rowIndex) => {
                  const order = rowOrders[row.key] ?? [];

                  // For days after Day 1: compute commute from last cell of previous day to first cell of current day
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
                    <DroppablePlannerRow key={row.key} rowKey={row.key}>
                      <div className="planner-row-date">
                        <strong>{row.label}</strong>
                        <span>{row.weekday}</span>
                      </div>

                      <SortableContext
                        items={order.map((slotId) => getCellId(slotId))}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="planner-row-cells">
                          {rowIndex > 0 && prevRow ? (
                            <DayCommuteCell
                              rowKey={row.key}
                              dayLabel={row.label}
                              prevDayLabel={effectivePrevRow?.label || prevRow.label}
                              fromValue={prevLastCell?.value}
                              toValue={currFirstCell?.value}
                              preference={commutes?.[dayCommuteKey]}
                              onOpenCommute={() =>
                                setActiveCommuteSegment({
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
                          ) : null}

                          {order.map((slotId, index) => {
                            const cellType = resolveCellType(slotId, cellTypes);
                            const prevSlotId = index > 0 ? order[index - 1] : null;
                            const segmentKey = prevSlotId ? `${row.key}:${prevSlotId}->${slotId}` : '';

                            return (
                              <Fragment key={slotId}>
                                {index === 0 ? (
                                  <InsertCellDivider
                                    onClick={() =>
                                      setPickerTarget({ rowKey: row.key, insertIndex: 0 })
                                    }
                                  />
                                ) : null}

                                {index > 0 && prevSlotId ? (
                                  <CommuteBridge
                                    rowKey={row.key}
                                    fromSlotId={prevSlotId}
                                    toSlotId={slotId}
                                    fromValue={cells[row.key]?.[prevSlotId]}
                                    toValue={cells[row.key]?.[slotId]}
                                    preference={commutes?.[segmentKey]}
                                    onOpenCommute={() =>
                                      setActiveCommuteSegment({
                                        rowKey: row.key,
                                        fromSlotId: prevSlotId,
                                        toSlotId: slotId,
                                        fromValue: cells[row.key]?.[prevSlotId] ?? '',
                                        toValue: cells[row.key]?.[slotId] ?? '',
                                        preference: commutes?.[segmentKey]
                                      })
                                    }
                                    onInsert={() =>
                                      setPickerTarget({ rowKey: row.key, insertIndex: index })
                                    }
                                  />
                                ) : null}

                                <DraggableEditableCell
                                  slotId={slotId}
                                  value={cells[row.key]?.[slotId] ?? ''}
                                  type={cellType}
                                  onOpenEdit={() => {
                                    setEditingCell({
                                      rowKey: row.key,
                                      columnId: slotId,
                                      value: cells[row.key]?.[slotId] ?? '',
                                      type: cellType,
                                      isNew: false
                                    });
                                  }}
                                  onDelete={() =>
                                    setCellToDelete({
                                      rowKey: row.key,
                                      slotId,
                                      value: cells[row.key]?.[slotId] ?? ''
                                    })
                                  }
                                />
                              </Fragment>
                            );
                          })}

                          <AddCellButton onClick={() => setPickerTarget({ rowKey: row.key })} />
                        </div>
                      </SortableContext>
                    </DroppablePlannerRow>
                  );
                })
              ) : (
                <div className="planner-empty">
                  Choose a valid date range to generate your itinerary rows.
                </div>
              )}
            </div>

            {typeof document !== 'undefined'
              ? createPortal(
                  <DragOverlay
                    dropAnimation={{
                      duration: 180,
                      easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)'
                    }}
                  >
                    {activeDrag ? <DragPreviewCard value={activeDrag.value} type={activeDrag.type} /> : null}
                  </DragOverlay>,
                  document.body
                )
              : null}
          </DndContext>
        </div>
      </section>

      {/* Commute Modal */}
      {activeCommuteSegment ? (
        <div
          className="cell-modal-backdrop"
          role="presentation"
          onClick={() => setActiveCommuteSegment(null)}
        >
          <section
            className="cell-modal cell-modal--commute"
            role="dialog"
            aria-modal="true"
            aria-label="Edit Commute"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cell-modal-header">
              <div>
                <span className="eyebrow">COMMUTE</span>
                <h3>
                  {activeCommuteSegment.isDayCommute
                    ? 'Commute from previous day'
                    : 'Travel between stops'}
                </h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setActiveCommuteSegment(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <CommuteModalContent
              origin={activeCommuteSegment.fromValue}
              destination={activeCommuteSegment.toValue}
              initialValue={{
                text:
                  activeCommuteSegment.preference?.customText ||
                  activeCommuteSegment.preference?.durationText ||
                  '',
                commuteMode: activeCommuteSegment.preference?.mode || 'DRIVING',
                commuteDistance: activeCommuteSegment.preference?.distanceText,
                originName:
                  getCellText(activeCommuteSegment.fromValue) ||
                  (activeCommuteSegment.isDayCommute ? 'Previous day stop' : ''),
                destinationName:
                  getCellText(activeCommuteSegment.toValue) ||
                  (activeCommuteSegment.isDayCommute ? 'First stop of day' : '')
              }}
              onSave={(updatedVal) => {
                const norm = normalizeCellValue(updatedVal);
                const segmentKey = activeCommuteSegment.isDayCommute
                  ? `dayCommute:${activeCommuteSegment.rowKey}`
                  : `${activeCommuteSegment.rowKey}:${activeCommuteSegment.fromSlotId}->${activeCommuteSegment.toSlotId}`;
                onCommutesChange((prev) => ({
                  ...prev,
                  [segmentKey]: {
                    mode: norm.commuteMode || 'DRIVING',
                    customText: norm.text,
                    durationText: norm.text,
                    distanceText: norm.commuteDistance
                  }
                }));
                setActiveCommuteSegment(null);
              }}
              onCancel={() => setActiveCommuteSegment(null)}
            />
          </section>
        </div>
      ) : null}

      {/* Place / Point Edit Modal */}
      {editingCell ? (
        <div className="cell-modal-backdrop" role="presentation" onClick={closeEditor}>
          <section
            className="cell-modal cell-modal--place-search"
            role="dialog"
            aria-modal="true"
            aria-label="Edit cell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cell-modal-header">
              <div>
                <span className={`eyebrow eyebrow--${editingCell.type}`}>
                  {editingCell.type === 'place'
                    ? 'Place • Destination'
                    : 'Point • Landmark'}
                </span>
                <h3>
                  {editingCell.type === 'place'
                    ? 'Search place or address'
                    : 'Search point or landmark'}
                </h3>
              </div>
              <button className="icon-button" type="button" onClick={closeEditor} aria-label="Close editor">
                ×
              </button>
            </div>

            <PlaceSearchModalContent
              cellType={editingCell.type}
              initialData={normalizeCellValue(editingCell.value)}
              onChange={(newData) => {
                setEditingCell((current) =>
                  current ? { ...current, value: newData } : current
                );
              }}
              onSave={() => saveEditorValue()}
              onCancel={closeEditor}
              destination={destination}
              destinationData={destinationData}
            />
          </section>
        </div>
      ) : null}

      {pickerTarget ? (
        <div
          className="cell-modal-backdrop"
          role="presentation"
          onClick={() => setPickerTarget(null)}
        >
          <section
            className="cell-modal cell-type-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose cell type"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setPickerTarget(null);
              }
            }}
          >
            <div className="cell-modal-header">
              <div>
                <span className="eyebrow">
                  {pickerTarget.insertIndex !== undefined ? 'Insert activity' : 'Add new activity'}
                </span>
                <h3>Choose cell type</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setPickerTarget(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="cell-type-options">
              <button
                type="button"
                className="cell-type-option cell-type-option--point"
                onClick={() => handleSelectCellType('point')}
              >
                <div className="cell-type-icon cell-type-icon--point" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                </div>
                <div className="cell-type-info">
                  <strong className="cell-type-title">Point</strong>
                  <span className="cell-type-desc">Highlight or stop with orange font</span>
                </div>
                <span className="cell-type-badge cell-type-badge--point">Orange text</span>
              </button>

              <button
                type="button"
                className="cell-type-option cell-type-option--place"
                onClick={() => handleSelectCellType('place')}
              >
                <div className="cell-type-icon cell-type-icon--place" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="cell-type-info">
                  <strong className="cell-type-title">Place</strong>
                  <span className="cell-type-desc">Destination or venue with purple font</span>
                </div>
                <span className="cell-type-badge cell-type-badge--place">Purple text</span>
              </button>
            </div>

            <div className="cell-modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPickerTarget(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {cellToDelete ? (
        <div
          className="cell-modal-backdrop"
          role="presentation"
          onClick={() => setCellToDelete(null)}
        >
          <section
            className="cell-modal cell-modal--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete confirmation"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setCellToDelete(null);
              }
            }}
          >
            <div className="cell-modal-header">
              <div>
                <span className="eyebrow eyebrow--danger">Delete activity</span>
                <h3>Delete this note?</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCellToDelete(null)}
                aria-label="Cancel deletion"
              >
                ×
              </button>
            </div>

            <p className="cell-delete-message">
              Are you sure you want to remove {getCellText(cellToDelete.value) ? (
                <>
                  note <strong>&ldquo;{getCellText(cellToDelete.value)}&rdquo;</strong>
                </>
              ) : (
                'this empty note'
              )} from your itinerary? This action cannot be undone.
            </p>

            <div className="cell-modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setCellToDelete(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                className="primary-button primary-button--danger"
                type="button"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function App() {
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<PageMode>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#planner') {
      return 'planner';
    }

    return loadPlannerState() ? 'planner' : 'setup';
  });
  const [tripName, setTripName] = useState('Bali, Indonesia');
  const [destination, setDestination] = useState('Bali, Indonesia');
  const [destinationData, setDestinationData] = useState<DestinationData | undefined>({
    name: 'Bali, Indonesia',
    formattedAddress: 'Bali, Indonesia',
    location: { lat: -8.409518, lng: 115.188916 },
    viewport: { north: -8.0, south: -8.9, east: 115.8, west: 114.4 },
    photoUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=800&q=80',
    placeId: 'demo-dest-bali'
  });
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(addDaysInputValue(todayInputValue(), 4));
  const [columns, setColumns] = useState<PlannerColumn[]>(defaultColumns);
  const [cells, setCells] = useState<PlannerCellMap>({});
  const [rowOrders, setRowOrders] = useState<Record<string, string[]>>({});
  const [cellTypes, setCellTypes] = useState<Record<string, CellType>>({});
  const [commutes, setCommutes] = useState<PlannerCommuteMap>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const dateRows = useMemo(() => buildDateRows(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    setRowOrders((current) => buildRowOrders(dateRows.map((row) => row.key), current));
  }, [dateRows]);

  useEffect(() => {
    const saved = loadPlannerState();

    if (saved) {
      setTripName(saved.tripName || saved.destination || '');
      setDestination(saved.destination || saved.tripName || '');
      if (saved.destinationData) {
        setDestinationData(saved.destinationData);
      } else if (saved.destination) {
        geocodeDestination(saved.destination).then((geo) => {
          if (geo) setDestinationData(geo);
        });
      }
      setStartDate(saved.startDate);
      setEndDate(saved.endDate);
      setColumns(saved.columns.length ? saved.columns : defaultColumns);

      const normalized = normalizePlannerState(saved);
      setCells(normalized.cells);
      setCellTypes(normalized.cellTypes);
      if (saved.commutes) {
        setCommutes(saved.commutes);
      }
      setRowOrders(
        buildRowOrders(
          buildDateRows(saved.startDate, saved.endDate).map((row) => row.key),
          normalized.rowOrders
        )
      );
      setPage((current) => (current === 'planner' ? current : 'planner'));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (isGoogleMapsConfigured()) {
      loadGooglePlacesScript();
    }
  }, []);

  useEffect(() => {
    const syncPageFromHash = () => {
      if (window.location.hash === '#planner') {
        setPage('planner');
      } else if (window.location.hash === '#setup') {
        setPage('setup');
      }
    };

    window.addEventListener('hashchange', syncPageFromHash);
    syncPageFromHash();

    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const state: PlannerState = {
        version: 1,
        tripName: tripName || destination,
        destination,
        destinationData,
        startDate,
        endDate,
        columns,
        cells,
        rowOrders,
        cellTypes,
        commutes
      };

      savePlannerState(state);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [cellTypes, columns, cells, commutes, destination, destinationData, endDate, hydrated, rowOrders, startDate, tripName]);

  const changeStartDate = (value: string) => {
    const adjusted = adjustStartDate(value, endDate);
    setStartDate(adjusted.startDate);
    setEndDate(adjusted.endDate);
  };

  const changeEndDate = (value: string) => {
    const adjusted = adjustEndDate(value, startDate);
    setStartDate(adjusted.startDate);
    setEndDate(adjusted.endDate);
  };

  const updateCell = (rowKey: string, columnId: string, value: CellValue) => {
    setCells((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? {}),
        [columnId]: value
      }
    }));
  };

  const addColumn = () => {
    setColumns((current) => [...current, makeColumnFromTemplate(current.length)]);
  };

  const addCell = (rowKey: string, type: CellType, insertIndex?: number): string => {
    const newSlotId = `${type}-${rowKey}-${Date.now()}`;

    setRowOrders((current) => {
      const existing = current[rowKey] ?? getDefaultRowOrder(rowKey);
      let updated: string[];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= existing.length) {
        updated = [...existing];
        updated.splice(insertIndex, 0, newSlotId);
      } else {
        updated = [...existing, newSlotId];
      }
      return {
        ...current,
        [rowKey]: updated
      };
    });

    setCellTypes((current) => ({
      ...current,
      [newSlotId]: type
    }));

    return newSlotId;
  };

  const deleteCell = (rowKey: string, slotId: string) => {
    setRowOrders((current) => ({
      ...current,
      [rowKey]: (current[rowKey] ?? []).filter((id) => id !== slotId)
    }));
    setCells((current) => {
      if (!current[rowKey]) return current;
      const { [slotId]: _removed, ...rest } = current[rowKey];
      return {
        ...current,
        [rowKey]: rest
      };
    });
    setCellTypes((current) => {
      const { [slotId]: _removed, ...rest } = current;
      return rest;
    });
  };

  const renameColumn = (columnId: string, value: string) => {
    setColumns((current) => current.map((column) => (column.id === columnId ? { ...column, title: value } : column)));
  };

  const removeColumn = (columnId: string) => {
    setColumns((current) => current.filter((column) => column.id !== columnId));
    setCells((current) => {
      const next: PlannerCellMap = {};

      for (const [rowKey, rowCells] of Object.entries(current)) {
        const { [columnId]: _removed, ...rest } = rowCells;
        next[rowKey] = rest;
      }

      return next;
    });
  };

  const resetPlanner = () => {
    const fresh = createFreshState();
    setTripName(fresh.tripName);
    setDestination(fresh.destination);
    setDestinationData(fresh.destinationData);
    setStartDate(fresh.startDate);
    setEndDate(fresh.endDate);
    setColumns(fresh.columns);
    setCells(fresh.cells);
    setRowOrders(fresh.rowOrders);
    setCellTypes({});
    setCommutes({});
    clearPlannerState();
    setLastSavedAt(null);
    window.location.hash = '#setup';
    setPage('setup');
  };

  const continueToPlanner = () => {
    if (!destination.trim()) {
      return;
    }
    if (!tripName.trim()) {
      setTripName(destination);
    }
    const normalized = normalizeDateRange(startDate, endDate);
    setStartDate(normalized.startDate);
    setEndDate(normalized.endDate);
    window.location.hash = '#planner';
    setPage('planner');
  };

  const goBackToSetup = () => {
    window.location.hash = '#setup';
    setPage('setup');
  };

  if (page === 'setup') {
    return (
      <SetupPage
        destination={destination}
        setDestination={(dest) => {
          setDestination(dest);
          setTripName(dest);
        }}
        destinationData={destinationData}
        setDestinationData={setDestinationData}
        startDate={startDate}
        setStartDate={changeStartDate}
        endDate={endDate}
        setEndDate={changeEndDate}
        onContinue={continueToPlanner}
      />
    );
  }

  return (
    <PlannerPage
      tripName={tripName || destination}
      destination={destination}
      destinationData={destinationData}
      startDate={startDate}
      endDate={endDate}
      columns={columns}
      rowOrders={rowOrders}
      cells={cells}
      cellTypes={cellTypes}
      commutes={commutes}
      lastSavedAt={lastSavedAt}
      onBack={goBackToSetup}
      onTripReset={resetPlanner}
      onTripNameChange={setTripName}
      onStartDateChange={changeStartDate}
      onEndDateChange={changeEndDate}
      onAddColumn={addColumn}
      onAddCell={addCell}
      onRenameColumn={renameColumn}
      onRemoveColumn={removeColumn}
      onCellChange={updateCell}
      onDeleteCell={deleteCell}
      onRowOrdersChange={setRowOrders}
      onCellsChange={setCells}
      onCellTypesChange={setCellTypes}
      onCommutesChange={setCommutes}
    />
  );
}

export default App;
