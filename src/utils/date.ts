import { addDays, eachDayOfInterval, format, isAfter, parseISO } from 'date-fns';
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
