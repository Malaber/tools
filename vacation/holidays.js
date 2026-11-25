// Statewide rules from the Bundesbank holiday calendar, augmented by the
// Brandenburg and Bavarian holiday acts and Berlin's announced one-off dates.
import { dateKey, shiftDate } from './dates.js';

export const states = {
  BW: ['Baden-Württemberg', 'Baden-Württemberg'],
  BY: ['Bavaria', 'Bayern'],
  BE: ['Berlin', 'Berlin'],
  BB: ['Brandenburg', 'Brandenburg'],
  HB: ['Bremen', 'Bremen'],
  HH: ['Hamburg', 'Hamburg'],
  HE: ['Hesse', 'Hessen'],
  MV: ['Mecklenburg-Western Pomerania', 'Mecklenburg-Vorpommern'],
  NI: ['Lower Saxony', 'Niedersachsen'],
  NW: ['North Rhine-Westphalia', 'Nordrhein-Westfalen'],
  RP: ['Rhineland-Palatinate', 'Rheinland-Pfalz'],
  SL: ['Saarland', 'Saarland'],
  SN: ['Saxony', 'Sachsen'],
  ST: ['Saxony-Anhalt', 'Sachsen-Anhalt'],
  SH: ['Schleswig-Holstein', 'Schleswig-Holstein'],
  TH: ['Thuringia', 'Thüringen']
};

export const localOptions = {
  BY: ['augsburg', 'assumption'],
  SN: ['corpusChristi'],
  TH: ['corpusChristi']
};

const allStates = Object.keys(states);
const westernCorpus = ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'];
const easternReformation = ['BB', 'MV', 'SN', 'ST', 'TH'];
const calendars = new Map();

// Gregorian computus (Meeus/Jones/Butcher).
function easterSunday(year) {
  const floor = Math.floor;
  const a = year % 19;
  const century = floor(year / 100);
  const rest = year % 100;
  const f = floor((century + 8) / 25);
  const h = (19 * a + century - floor(century / 4) - floor((century - f + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (century % 4) + 2 * floor(rest / 4) - h - rest % 4) % 7;
  const m = floor((a + 11 * h + 22 * l) / 451);
  const offset = h + l - 7 * m + 114;
  return dateKey(new Date(Date.UTC(year, floor(offset / 31) - 1, offset % 31 + 1)));
}

export function holidayCalendar(year) {
  if (calendars.has(year)) return calendars.get(year);
  const calendar = new Map();
  function add(date, name, regions = allStates, local = []) {
    const key = date.length === 5 ? year + '-' + date : date;
    if (!calendar.has(key)) calendar.set(key, []);
    calendar.get(key).push({ name, regions, local });
  }
  const easter = easterSunday(year);
  add('01-01', 'newYear');
  add('01-06', 'epiphany', ['BW', 'BY', 'ST']);
  if (year >= 2019) add('03-08', 'womensDay', year >= 2023 ? ['BE', 'MV'] : ['BE']);
  add(shiftDate(easter, -2), 'goodFriday');
  add(easter, 'easter', ['BB']);
  add(shiftDate(easter, 1), 'easterMonday');
  add('05-01', 'labourDay');
  if (year === 2020 || year === 2025) add('05-08', 'liberation', ['BE']);
  add(shiftDate(easter, 39), 'ascension');
  add(shiftDate(easter, 49), 'whitSunday', ['BB']);
  add(shiftDate(easter, 50), 'whitMonday');
  add(shiftDate(easter, 60), 'corpusChristi', westernCorpus, ['SN', 'TH']);
  if (year === 2028) add('06-17', 'uprising', ['BE']);
  add('08-08', 'augsburg', [], ['BY']);
  add('08-15', 'assumption', ['SL'], ['BY']);
  if (year >= 2019) add('09-20', 'childrensDay', ['TH']);
  add('10-03', 'unity');
  add('10-31', 'reformation', year === 2017 ? allStates : [...easternReformation, 'HB', 'HH', 'NI', 'SH']);
  add('11-01', 'allSaints', ['BW', 'BY', 'NW', 'RP', 'SL']);
  const nov22 = new Date(Date.UTC(year, 10, 22));
  add(shiftDate(dateKey(nov22), -((nov22.getUTCDay() + 4) % 7)), 'repentance', ['SN']);
  add('12-25', 'christmas');
  add('12-26', 'boxingDay');
  calendars.set(year, calendar);
  return calendar;
}

export function holidaysOn(date) {
  return holidayCalendar(Number(date.slice(0, 4))).get(date) ?? [];
}

export function appliesTo(holiday, region, localHolidays) {
  return holiday.regions.length === allStates.length || holiday.regions.includes(region)
    || (holiday.local.includes(region) && localHolidays.includes(holiday.name));
}
