export const firstDate = '2017-01-01';
export const lastDate = '2099-12-31';
export const weekdays = [1, 2, 3, 4, 5, 6, 0];

export const utcDate = date => new Date(date + 'T00:00:00Z');
export const dateKey = date => date.toISOString().slice(0, 10);
export const weekday = date => utcDate(date).getUTCDay();

export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || date < firstDate || date > lastDate) return false;
  const parsed = utcDate(date);
  return Number.isFinite(parsed.getTime()) && dateKey(parsed) === date;
}

export function shiftDate(date, days) {
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return dateKey(result);
}

export function daysBetween(start, end) {
  return (utcDate(end) - utcDate(start)) / 86_400_000;
}

export function orderedDates(a, b) {
  return a <= b ? [a, b] : [b, a];
}

export function* daysIn(start, end) {
  for (let date = start; date <= end; date = shiftDate(date, 1)) yield date;
}

export function localToday(now = new Date()) {
  return dateKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
