import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import { addDaysInputValue, buildDateRows, normalizeDateRange, todayInputValue } from './utils/date';
import { clearPlannerState, loadPlannerState, savePlannerState } from './utils/storage';
import { CellType, DateRow, PlannerCellMap, PlannerColumn, PlannerState, resolveCellType } from './types';

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
    const nextRowCells: Record<string, string> = {};

    for (const slotId of order) {
      const isDefaultSlot = isSharedSlotId(slotId) || slotId.startsWith('slot-');
      const uniqueSlotId = isSharedSlotId(slotId) ? `${slotId}-${rowKey}` : slotId;
      const val = rowCells[slotId] ?? rowCells[uniqueSlotId] ?? '';

      // Skip empty initial default template slots so plans start clean with no cells
      if (isDefaultSlot && !val) {
        continue;
      }

      nextOrder.push(uniqueSlotId);
      cellTypes[uniqueSlotId] = resolveCellType(uniqueSlotId, state.cellTypes);
      if (val) {
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
    tripName: 'Coastal Escape',
    destination: 'Bali, Indonesia',
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
  value: string;
  type: CellType;
  onOpenEdit: () => void;
  onDelete: () => void;
}) {
  const cellId = getCellId(slotId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cellId });

  return (
    <div
      ref={setNodeRef}
      className={`planner-cell-card planner-cell-card--${type} ${value ? 'planner-cell-card--filled' : 'planner-cell-card--empty'} ${isDragging ? 'planner-cell-card--dragging' : ''}`}
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
        className={`planner-cell-content planner-cell-content--${type} ${value ? 'planner-cell-content--filled' : 'planner-cell-content--empty'}`}
        role="button"
        tabIndex={0}
        aria-label={
          type === 'travelling'
            ? value ? `Commute: ${value}` : 'Add commute time'
            : type === 'place'
            ? value ? `Place: ${value}` : 'Add place'
            : value ? `Point: ${value}` : 'Add point'
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
              <svg
                className="travelling-car-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2" />
                <circle cx="7" cy="17" r="2" />
                <path d="M9 17h6" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </div>
            <div className="travelling-value-text">
              {value || 'add commute time'}
            </div>
          </>
        ) : (
          value || (type === 'place' ? 'Add place' : 'Add point')
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

function DragPreviewCard({ value, type }: { value: string; type: CellType }) {
  return (
    <div className={`planner-cell-card planner-cell-card--drag-overlay planner-cell-card--${type}`}>
      <div className="cell-drag-handle">⠿</div>
      {type === 'travelling' ? (
        <div className="planner-cell-content planner-cell-content--travelling planner-cell-content--filled">
          <div className="travelling-icon-wrap" aria-hidden="true">
            <svg
              className="travelling-car-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2" />
              <circle cx="7" cy="17" r="2" />
              <path d="M9 17h6" />
              <circle cx="17" cy="17" r="2" />
            </svg>
          </div>
          <div className="travelling-value-text">{value || 'add commute time'}</div>
        </div>
      ) : (
        <div className={`planner-cell-content planner-cell-content--filled planner-cell-content--${type}`}>
          {value || (type === 'place' ? 'Add place' : 'Add point')}
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
  tripName,
  setTripName,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onContinue
}: {
  tripName: string;
  setTripName: (value: string) => void;
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
            Start with a trip name and your travel dates. We’ll build a clean, colorful planning table on the next
            screen.
          </p>

          <div className="setup-highlights">
            <div className="stat-card">
              <strong>2 steps</strong>
              <span>setup, then planning</span>
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
            onContinue();
          }}
        >
          <label>
            Trip name
            <input
              value={tripName}
              onChange={(event) => setTripName(event.target.value)}
              placeholder="Coastal Escape"
              autoComplete="off"
            />
          </label>
          <label>
            From
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>

          <button className="primary-button setup-continue-button" type="submit">
            Continue to planner
          </button>
        </form>
      </section>
    </main>
  );
}

function PlannerPage({
  tripName,
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
  onCellsChange
}: {
  tripName: string;
  startDate: string;
  endDate: string;
  columns: PlannerColumn[];
  rowOrders: Record<string, string[]>;
  cells: PlannerCellMap;
  cellTypes: Record<string, CellType>;
  lastSavedAt: string | null;
  onBack: () => void;
  onTripReset: () => void;
  onTripNameChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onAddColumn: () => void;
  onAddCell: (rowKey: string, type: CellType) => string;
  onRenameColumn: (columnId: string, value: string) => void;
  onRemoveColumn: (columnId: string) => void;
  onCellChange: (rowKey: string, columnId: string, value: string) => void;
  onDeleteCell: (rowKey: string, slotId: string) => void;
  onRowOrdersChange: (orders: Record<string, string[]>) => void;
  onCellsChange: (cells: PlannerCellMap) => void;
}) {
  const dateRows = useMemo<DateRow[]>(() => buildDateRows(startDate, endDate), [startDate, endDate]);
  const totalActivitiesCount = useMemo(() => {
    return Object.values(rowOrders).reduce((sum, order) => sum + order.length, 0);
  }, [rowOrders]);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    columnId: string;
    value: string;
    type: CellType;
  } | null>(null);
  const [cellToDelete, setCellToDelete] = useState<{ rowKey: string; slotId: string; value: string } | null>(null);
  const [activeDrag, setActiveDrag] = useState<{
    id: string;
    slotId: string;
    value: string;
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
    setEditingCell(null);
  };

  const handleSelectCellType = (type: CellType) => {
    if (!pickerRowKey) {
      return;
    }

    const targetRowKey = pickerRowKey;
    const newSlotId = onAddCell(targetRowKey, type);
    setPickerRowKey(null);
    setEditingCell({
      rowKey: targetRowKey,
      columnId: newSlotId,
      value: '',
      type
    });
  };

  const saveEditorValue = () => {
    if (!editingCell) {
      return;
    }

    onCellChange(editingCell.rowKey, editingCell.columnId, editingCell.value);
    closeEditor();
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
          <span className="eyebrow">Trip overview</span>
          <h1>{tripName || 'Untitled trip'}</h1>
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
                dateRows.map((row) => {
                  const order = rowOrders[row.key] ?? [];

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
                          {order.map((slotId) => {
                            const cellType = resolveCellType(slotId, cellTypes);

                            return (
                              <DraggableEditableCell
                                key={slotId}
                                slotId={slotId}
                                value={cells[row.key]?.[slotId] ?? ''}
                                type={cellType}
                                onOpenEdit={() =>
                                  setEditingCell({
                                    rowKey: row.key,
                                    columnId: slotId,
                                    value: cells[row.key]?.[slotId] ?? '',
                                    type: cellType
                                  })
                                }
                                onDelete={() =>
                                  setCellToDelete({
                                    rowKey: row.key,
                                    slotId,
                                    value: cells[row.key]?.[slotId] ?? ''
                                  })
                                }
                              />
                            );
                          })}

                          <AddCellButton onClick={() => setPickerRowKey(row.key)} />
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

      {editingCell ? (
        <div className="cell-modal-backdrop" role="presentation" onClick={closeEditor}>
          <section
            className="cell-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit cell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cell-modal-header">
              <div>
                <span className={`eyebrow eyebrow--${editingCell.type}`}>
                  {editingCell.type === 'travelling'
                    ? 'Travelling • Commute'
                    : editingCell.type === 'place'
                    ? 'Place'
                    : 'Point'}
                </span>
                <h3>
                  {editingCell.type === 'travelling'
                    ? 'Set commute time'
                    : editingCell.type === 'place'
                    ? 'Update place note'
                    : 'Update point note'}
                </h3>
              </div>
              <button className="icon-button" type="button" onClick={closeEditor} aria-label="Close editor">
                ×
              </button>
            </div>

            <input
              className={`cell-modal-input cell-modal-input--${editingCell.type}`}
              autoFocus
              value={editingCell.value}
              onChange={(event) => setEditingCell((current) => (current ? { ...current, value: event.target.value } : current))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveEditorValue();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeEditor();
                }
              }}
              placeholder={
                editingCell.type === 'travelling'
                  ? 'add commute time'
                  : editingCell.type === 'place'
                  ? 'Add place name or details'
                  : 'Add point note'
              }
            />

            <div className="cell-modal-actions">
              <button className="primary-button" type="button" onClick={saveEditorValue}>
                Save
              </button>
              <button className="secondary-button" type="button" onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pickerRowKey ? (
        <div
          className="cell-modal-backdrop"
          role="presentation"
          onClick={() => setPickerRowKey(null)}
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
                setPickerRowKey(null);
              }
            }}
          >
            <div className="cell-modal-header">
              <div>
                <span className="eyebrow">Add new activity</span>
                <h3>Choose cell type</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setPickerRowKey(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <div className="cell-type-options">
              <button
                type="button"
                className="cell-type-option cell-type-option--travelling"
                onClick={() => handleSelectCellType('travelling')}
              >
                <div className="cell-type-icon cell-type-icon--travelling" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                </div>
                <div className="cell-type-info">
                  <strong className="cell-type-title">Travelling</strong>
                  <span className="cell-type-desc">Has car icon & commute time</span>
                </div>
                <span className="cell-type-badge cell-type-badge--travelling">🚗 Commute</span>
              </button>

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
                onClick={() => setPickerRowKey(null)}
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
              Are you sure you want to remove {cellToDelete.value ? (
                <>
                  note <strong>&ldquo;{cellToDelete.value}&rdquo;</strong>
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
  const [tripName, setTripName] = useState('Coastal Escape');
  const [destination, setDestination] = useState('Bali, Indonesia');
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(addDaysInputValue(todayInputValue(), 4));
  const [columns, setColumns] = useState<PlannerColumn[]>(defaultColumns);
  const [cells, setCells] = useState<PlannerCellMap>({});
  const [rowOrders, setRowOrders] = useState<Record<string, string[]>>({});
  const [cellTypes, setCellTypes] = useState<Record<string, CellType>>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const dateRows = useMemo(() => buildDateRows(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    setRowOrders((current) => buildRowOrders(dateRows.map((row) => row.key), current));
  }, [dateRows]);

  useEffect(() => {
    const saved = loadPlannerState();

    if (saved) {
      setTripName(saved.tripName);
      setDestination(saved.destination);
      setStartDate(saved.startDate);
      setEndDate(saved.endDate);
      setColumns(saved.columns.length ? saved.columns : defaultColumns);

      const normalized = normalizePlannerState(saved);
      setCells(normalized.cells);
      setCellTypes(normalized.cellTypes);
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
        tripName,
        destination,
        startDate,
        endDate,
        columns,
        cells,
        rowOrders,
        cellTypes
      };

      savePlannerState(state);
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [cellTypes, columns, cells, destination, endDate, hydrated, rowOrders, startDate, tripName]);

  const changeStartDate = (value: string) => {
    const normalized = normalizeDateRange(value, endDate);
    setStartDate(normalized.startDate);
    setEndDate(normalized.endDate);
  };

  const changeEndDate = (value: string) => {
    const normalized = normalizeDateRange(startDate, value);
    setStartDate(normalized.startDate);
    setEndDate(normalized.endDate);
  };

  const updateCell = (rowKey: string, columnId: string, value: string) => {
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

  const addCell = (rowKey: string, type: CellType): string => {
    const newSlotId = `${type}-${rowKey}-${Date.now()}`;

    setRowOrders((current) => ({
      ...current,
      [rowKey]: [...(current[rowKey] ?? getDefaultRowOrder(rowKey)), newSlotId]
    }));

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
    setStartDate(fresh.startDate);
    setEndDate(fresh.endDate);
    setColumns(fresh.columns);
    setCells(fresh.cells);
    setRowOrders(fresh.rowOrders);
    setCellTypes({});
    clearPlannerState();
    setLastSavedAt(null);
    window.location.hash = '#setup';
    setPage('setup');
  };

  const continueToPlanner = () => {
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
        tripName={tripName}
        setTripName={setTripName}
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
      tripName={tripName}
      startDate={startDate}
      endDate={endDate}
      columns={columns}
      rowOrders={rowOrders}
      cells={cells}
      cellTypes={cellTypes}
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
    />
  );
}

export default App;
