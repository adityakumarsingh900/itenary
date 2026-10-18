import { addDays, eachDayOfInterval, format, isAfter, isValid, parseISO } from 'date-fns';
import { DateRow } from '../types';

export function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function addDaysInputValue(value: string, amount: number) {
  return format(addDays(parseISO(value), amount), 'yyyy-MM-dd');
}

export function normalizeDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    return { startDate, endDate };
  }

  if (isAfter(parseISO(startDate), parseISO(endDate))) {
    return { startDate: endDate, endDate: startDate };
  }

  return { startDate, endDate };
}

export function adjustStartDate(newStartDate: string, currentEndDate: string) {
  if (!newStartDate || !currentEndDate) {
    return { startDate: newStartDate, endDate: currentEndDate };
  }

  const start = parseISO(newStartDate);
  const end = parseISO(currentEndDate);

  if (isValid(start) && isValid(end) && isAfter(start, end)) {
    return { startDate: newStartDate, endDate: newStartDate };
  }

  return { startDate: newStartDate, endDate: currentEndDate };
}

export function adjustEndDate(newEndDate: string, currentStartDate: string) {
  if (!newEndDate || !currentStartDate) {
    return { startDate: currentStartDate, endDate: newEndDate };
  }

  const start = parseISO(currentStartDate);
  const end = parseISO(newEndDate);

  if (isValid(start) && isValid(end) && isAfter(start, end)) {
    return { startDate: newEndDate, endDate: newEndDate };
  }

  return { startDate: currentStartDate, endDate: newEndDate };
}

export function buildDateRows(startDate: string, endDate: string): DateRow[] {
  if (!startDate || !endDate) {
    return [];
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);

  if (isAfter(start, end)) {
    return [];
  }

  return eachDayOfInterval({ start, end }).map((date) => ({
    key: format(date, 'yyyy-MM-dd'),
    label: format(date, 'd MMM yyyy'),
    weekday: format(date, 'EEEE')
  }));
}
