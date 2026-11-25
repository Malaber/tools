import { daysBetween, daysIn, localToday, shiftDate, validDate, weekday } from './dates.js';
import { appliesTo, holidaysOn, localOptions, states } from './holidays.js';

export const storageKey = 'malaber.vacation.v1';
export const maxAllowance = 3650;

export function defaultPlan(today = localToday(), languages = []) {
  const year = today.slice(0, 4);
  const preferred = languages.find(language => /^(de|en)(-|$)/i.test(language));
  return {
    version: 1,
    language: /^de/i.test(preferred ?? '') ? 'de' : 'en',
    region: 'DE',
    localHolidays: [],
    workdays: [1, 2, 3, 4, 5],
    allowance: 30,
    start: year + '-01-01',
    end: year + '-12-31',
    planned: []
  };
}

export function validAllowance(value) {
  return Number.isInteger(value) && value >= 0 && value <= maxAllowance;
}

export function readPlan(json) {
  const data = JSON.parse(json);
  if (!data || data.version !== 1 || !['en', 'de'].includes(data.language)
    || (data.region !== 'DE' && !Object.hasOwn(states, data.region))
    || !Array.isArray(data.localHolidays)
    || !data.localHolidays.every(name => (localOptions[data.region] ?? []).includes(name))
    || !Array.isArray(data.workdays)
    || !data.workdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    || !validAllowance(data.allowance) || !validDate(data.start) || !validDate(data.end)
    || data.start > data.end || !Array.isArray(data.planned) || !data.planned.every(validDate)) {
    throw new Error('Invalid vacation plan');
  }
  const { version, language, region, allowance, start, end } = data;
  return {
    version, language, region, allowance, start, end,
    localHolidays: [...new Set(data.localHolidays)],
    workdays: [...new Set(data.workdays)],
    planned: [...new Set(data.planned)].sort()
  };
}

export function inPeriod(plan, date) {
  return date >= plan.start && date <= plan.end;
}

export function usesLeave(plan, date) {
  return plan.workdays.includes(weekday(date))
    && !holidaysOn(date).some(holiday => appliesTo(holiday, plan.region, plan.localHolidays));
}

export function editDates(planned, start, end, add) {
  const updated = new Set(planned);
  for (const date of daysIn(start, end)) {
    if (add) updated.add(date);
    else updated.delete(date);
  }
  return [...updated].sort();
}

export function summarize(plan) {
  const blocks = [];
  let used = 0;
  let outside = 0;
  for (const date of plan.planned) {
    if (!inPeriod(plan, date)) {
      outside += 1;
      continue;
    }
    let block = blocks.at(-1);
    if (!block || shiftDate(block.end, 1) !== date) {
      block = { start: date, end: date, days: 0, used: 0 };
      blocks.push(block);
    }
    block.end = date;
    block.days += 1;
    if (usesLeave(plan, date)) {
      block.used += 1;
      used += 1;
    }
  }
  return { blocks, used, outside, remaining: plan.allowance - used };
}

export function moveBlock(plan, block, start) {
  if (!validDate(start)) return { error: 'outsideRange' };
  const end = shiftDate(start, daysBetween(block.start, block.end));
  if (!inPeriod(plan, start) || !inPeriod(plan, end)) return { error: 'outsideRange' };

  const updated = new Set(plan.planned);
  for (const date of daysIn(block.start, block.end)) updated.delete(date);
  for (const date of daysIn(start, end)) {
    if (updated.has(date)) return { error: 'overlap' };
    updated.add(date);
  }
  return { planned: [...updated].sort(), end };
}
