import { copy, holidayNames } from './copy.js';
import { daysBetween, daysIn, firstDate, lastDate, localToday, orderedDates, shiftDate, utcDate, validDate, weekday, weekdays } from './dates.js';
import { appliesTo, holidaysOn, localOptions, states } from './holidays.js';
import { defaultPlan, editDates, inPeriod, moveBlock, readPlan, storageKey, summarize, usesLeave, validAllowance } from './plan.js';

const $ = id => document.getElementById(id);
const months = $('months');
const today = localToday();
const finePointer = matchMedia('(any-pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const planStart = $('period-start');
const planEnd = $('period-end');
const selectionStart = $('selection-start');
const selectionEnd = $('selection-end');
for (const input of [planStart, planEnd]) {
  input.min = firstDate;
  input.max = lastDate;
}
$('settings').open = !matchMedia('(max-width: 850px)').matches;

let storageAvailable = true;
let plan = defaultPlan(today, navigator.languages);
let saved;
try {
  saved = localStorage.getItem(storageKey);
} catch {
  storageAvailable = false;
}
if (saved) {
  try {
    plan = readPlan(saved);
  } catch {
    // An invalid saved plan leaves the defaults usable.
  }
}

let summary;
let view = 'plan';
let year = '';
let focusedDate;
let rangeAnchor;
let movingBlock;
let pendingImport;
let drag;
let suppressClick = false;
let preview = [];
let dayButtons = new Map();
let blocksByDate = new Map();
let localeIndex;
let dayFormat;
let rangeFormat;
let monthFormat;
let shortWeekday;
let longWeekday;
let numberFormat;

function t(key, values = {}) {
  return copy[plan.language][key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function formatRange(start, end) {
  return rangeFormat.formatRange(utcDate(start), utcDate(end));
}

function feedback(id, message = '') {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function announce(message) {
  $('announcement').textContent = message;
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(plan));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  $('storage').textContent = t(storageAvailable ? 'localStorage' : 'storageError');
}

function translate() {
  const language = plan.language;
  document.documentElement.lang = language;
  document.title = t('title');
  $('language').value = language;
  localeIndex = language === 'de' ? 1 : 0;
  const locale = language === 'de' ? 'de-DE' : 'en-GB';
  const dateFormat = options => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
  dayFormat = dateFormat({ dateStyle: 'full' });
  rangeFormat = dateFormat({ dateStyle: 'medium' });
  monthFormat = dateFormat({ month: 'long' });
  shortWeekday = dateFormat({ weekday: 'short' });
  longWeekday = dateFormat({ weekday: 'long' });
  numberFormat = new Intl.NumberFormat(locale);

  for (const node of document.querySelectorAll('[data-text]')) node.textContent = t(node.dataset.text);
  for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label));
  $('storage').textContent = t(storageAvailable ? 'localStorage' : 'storageError');
  feedback('settings-feedback');
  feedback('calendar-feedback');
  feedback('backup-feedback');
}

function renderSettings() {
  const names = Object.entries(states).map(([id, labels]) => [id, labels[localeIndex]]);
  names.sort((a, b) => a[1].localeCompare(b[1], plan.language));
  $('region').replaceChildren(...[['DE', t('nationwide')], ...names].map(([id, label]) => new Option(label, id)));
  $('region').value = plan.region;
  $('workdays').replaceChildren(...weekdays.map((day, index) => {
    const date = utcDate(shiftDate('2024-01-01', index));
    const button = element('button', '', shortWeekday.format(date).replace(/\.$/, ''));
    button.type = 'button';
    button.dataset.day = day;
    button.title = longWeekday.format(date);
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', plan.workdays.includes(day));
    return button;
  }));
  renderLocalOptions();
  $('allowance').value = plan.allowance;
  planStart.value = plan.start;
  planEnd.value = plan.end;
  $('next-year').hidden = Number(today.slice(0, 4)) >= Number(lastDate.slice(0, 4));
}

function renderLocalOptions() {
  const options = localOptions[plan.region] ?? [];
  $('local-holidays').hidden = !options.length;
  $('local-options').replaceChildren(...options.map(name => {
    const label = element('label');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = name;
    checkbox.checked = plan.localHolidays.includes(name);
    label.append(checkbox, element('span', '', t('local_' + name)));
    return label;
  }));
}

function renderBalance() {
  $('remaining').textContent = numberFormat.format(summary.remaining);
  $('remaining').closest('.balance-main').classList.toggle('over-budget', summary.remaining < 0);
  $('used').textContent = numberFormat.format(summary.used);
  $('total').textContent = numberFormat.format(plan.allowance);
  $('used-meter').max = Math.max(1, plan.allowance);
  $('used-meter').value = Math.min(summary.used, $('used-meter').max);
  $('used-meter').setAttribute('aria-valuetext', summary.remaining < 0
    ? t('overBudget', { count: numberFormat.format(-summary.remaining) })
    : numberFormat.format(summary.used) + ' / ' + numberFormat.format(plan.allowance));
  $('outside-note').textContent = t('outside');
  $('outside-note').hidden = !summary.outside;
}

function renderBlocks() {
  $('empty-plan').hidden = !!summary.blocks.length;
  $('blocks').hidden = !summary.blocks.length;
  $('blocks').replaceChildren(...summary.blocks.map(block => {
    const range = formatRange(block.start, block.end);
    const item = element('li', 'block');
    const actions = element('div', 'block-actions');
    item.append(element('strong', '', range), element('p', 'small', t('blockCost', {
      used: numberFormat.format(block.used), days: numberFormat.format(block.days)
    })), actions);
    for (const action of ['move', 'remove']) {
      const button = element('button', 'subtle', t(action));
      button.type = 'button';
      button.dataset.action = action;
      button.dataset.start = block.start;
      button.setAttribute('aria-label', t(action) + ' ' + range);
      actions.append(button);
    }
    return item;
  }));
}

function renderNavigation() {
  const firstYear = plan.start.slice(0, 4);
  const lastYear = plan.end.slice(0, 4);
  if (!year || year < firstYear || year > lastYear) year = firstYear;
  const years = [];
  for (let value = Number(firstYear); value <= Number(lastYear); value++) years.push(new Option(value, value));
  $('view-year').replaceChildren(...years);
  $('view-year').value = year;
  $('year-field').hidden = firstYear === lastYear;
  $('period-caption').textContent = formatRange(plan.start, plan.end);
  const firstMonth = firstYear === year ? Number(plan.start.slice(5, 7)) : 1;
  const lastMonth = lastYear === year ? Number(plan.end.slice(5, 7)) : 12;
  return Array.from({ length: lastMonth - firstMonth + 1 }, (_, offset) => year + '-' + String(firstMonth + offset).padStart(2, '0'));
}

function calendarHint() {
  $('calendar-hint').textContent = t(view === 'heatmap' ? 'heatHint' : finePointer.matches ? 'planHint' : 'touchHint');
}

function makeDay(date, planned) {
  const button = element('button', 'day', numberFormat.format(Number(date.slice(8))));
  button.type = 'button';
  button.tabIndex = -1;
  button.dataset.date = date;
  const inBounds = inPeriod(plan, date);
  const holidays = holidaysOn(date);
  const applicable = holidays.filter(holiday => appliesTo(holiday, plan.region, plan.localHolidays));
  const covered = new Set(holidays.flatMap(holiday => holiday.regions)).size;
  const off = !plan.workdays.includes(weekday(date));
  const isPlanned = planned.has(date) && inBounds;
  button.disabled = !inBounds;
  if (date === today) button.setAttribute('aria-current', 'date');
  const labels = [dayFormat.format(utcDate(date))];
  if (view === 'plan') {
    button.classList.toggle('off', off);
    button.classList.toggle('holiday', !!applicable.length);
    button.classList.toggle('leave', isPlanned && !off && !applicable.length);
    button.classList.toggle('in-block', isPlanned && (off || !!applicable.length));
    if (inBounds) button.setAttribute('aria-pressed', isPlanned);
    if (applicable.length) labels.push(...applicable.map(holiday => holidayNames[holiday.name][localeIndex]));
    else labels.push(t(off ? 'offDay' : 'workday'));
    if (isPlanned) labels.push(t(off || applicable.length ? 'leaveOnDayOff' : 'leave'));
  } else {
    if (covered) button.classList.add(covered === 16 ? 'heat-3' : covered >= 5 ? 'heat-2' : 'heat-1');
    else if (holidays.length) button.classList.add('heat-local');
    button.classList.toggle('local', !!applicable.length);
    labels.push(...holidays.map(holiday => holidayNames[holiday.name][localeIndex]));
    if (!holidays.length) labels.push(t('clearDay'));
  }
  button.title = labels.join(' · ');
  button.setAttribute('aria-label', button.title);
  if (inBounds) dayButtons.set(date, button);
  return button;
}

function renderCalendar() {
  const activeDate = months.contains(document.activeElement) ? document.activeElement.dataset.date : undefined;
  const monthKeys = renderNavigation();
  const heatmap = view === 'heatmap';
  $('planner-view').setAttribute('aria-pressed', !heatmap);
  $('heatmap-view').setAttribute('aria-pressed', heatmap);
  $('plan-legend').hidden = heatmap;
  $('heatmap-legend').hidden = !heatmap;
  $('add-dates').hidden = heatmap;
  calendarHint();
  dayButtons = new Map();
  const planned = new Set(plan.planned);
  const jump = $('jump-month');
  const previousMonth = jump.value;
  jump.replaceChildren(new Option(t('chooseMonth'), ''));

  months.replaceChildren(...monthKeys.map(key => {
    const first = key + '-01';
    const utc = utcDate(first);
    const count = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0)).getUTCDate();
    const label = monthFormat.format(utc);
    jump.add(new Option(label, key));
    const month = element('section', 'month');
    month.id = 'month-' + key;
    month.append(element('h3', '', label));
    const grid = element('div', 'month-grid');
    for (let index = 0; index < weekdays.length; index++) {
      const sampleDate = utcDate(shiftDate('2024-01-01', index));
      const day = element('span', 'weekday', shortWeekday.format(sampleDate).slice(0, 2));
      day.setAttribute('aria-hidden', 'true');
      grid.append(day);
    }
    for (let index = 0; index < (weekday(first) + 6) % 7; index++) grid.append(element('span'));
    for (let index = 0; index < count; index++) grid.append(makeDay(shiftDate(first, index), planned));
    month.append(grid);
    return month;
  }));
  jump.value = monthKeys.includes(previousMonth) ? previousMonth : '';

  if (!dayButtons.has(focusedDate)) focusedDate = dayButtons.keys().next().value;
  dayButtons.get(focusedDate).tabIndex = 0;
  if (activeDate && dayButtons.has(activeDate)) focusDay(activeDate, true);
}

function renderPlan() {
  summary = summarize(plan);
  blocksByDate = new Map();
  for (const block of summary.blocks) {
    for (const date of daysIn(block.start, block.end)) blocksByDate.set(date, block);
  }
  renderBalance();
  renderBlocks();
  renderCalendar();
}

function focusDay(date, focus = false) {
  if (!dayButtons.has(date)) return;
  dayButtons.get(focusedDate).tabIndex = -1;
  focusedDate = date;
  const button = dayButtons.get(date);
  button.tabIndex = 0;
  if (focus) button.focus({ preventScroll: true });
}

function updateDates(planned) {
  plan.planned = planned;
  persist();
  renderPlan();
  feedback('calendar-feedback');
  announce(t('saved', { remaining: numberFormat.format(summary.remaining) }));
}

function editRange(a, b, add) {
  const [start, end] = orderedDates(a, b);
  updateDates(editDates(plan.planned, start, end, add));
}

function showHoliday(date, holidays) {
  $('holiday-title').textContent = dayFormat.format(utcDate(date));
  $('holiday-details').replaceChildren(...holidays.map(holiday => {
    const item = element('li');
    item.append(element('strong', '', holidayNames[holiday.name][localeIndex]));
    if (holiday.regions.length) {
      const regions = holiday.regions.map(region => states[region][localeIndex]).join(', ');
      item.append(element('p', 'small', holiday.regions.length === 16 ? t('allStates') : regions));
    }
    if (holiday.local.length) {
      const regions = holiday.local.map(region => states[region][localeIndex]).join(', ');
      item.append(element('p', 'small', t('localIn', { regions })));
    }
    return item;
  }));
  $('holiday-dialog').showModal();
}

function openDateDialog(block) {
  movingBlock = block;
  const start = block?.start ?? (inPeriod(plan, today) ? today : plan.start);
  for (const input of [selectionStart, selectionEnd]) {
    input.min = plan.start;
    input.max = plan.end;
    input.value = start;
  }
  $('selection-end-field').hidden = !!block;
  selectionEnd.disabled = !!block;
  $('date-dialog-title').textContent = t(block ? 'moveBlock' : 'addDates');
  $('date-dialog-note').textContent = block
    ? t('moveNote', { range: formatRange(block.start, block.end) })
    : t('addNote');
  $('save-dates').textContent = t(block ? 'saveMove' : 'addDates');
  feedback('date-feedback');
  $('date-dialog').showModal();
}

function revealDate(date) {
  year = date.slice(0, 4);
  if (!dayButtons.has(date)) renderCalendar();
  focusDay(date, true);
  dayButtons.get(date).scrollIntoView({ block: 'nearest' });
}

function setView(next) {
  view = next;
  rangeAnchor = undefined;
  feedback('calendar-feedback');
  renderCalendar();
}

$('language').addEventListener('change', event => {
  plan.language = event.target.value;
  persist();
  translate();
  renderSettings();
  renderPlan();
});
$('region').addEventListener('change', event => {
  plan.region = event.target.value;
  plan.localHolidays = [];
  renderLocalOptions();
  persist();
  renderPlan();
});
$('local-options').addEventListener('change', event => {
  const { checked, value } = event.target;
  plan.localHolidays = checked ? [...plan.localHolidays, value] : plan.localHolidays.filter(name => name !== value);
  persist();
  renderPlan();
});
$('workdays').addEventListener('click', event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  const day = Number(button.dataset.day);
  const selected = plan.workdays.includes(day);
  plan.workdays = selected ? plan.workdays.filter(value => value !== day) : [...plan.workdays, day];
  button.setAttribute('aria-pressed', !selected);
  persist();
  renderPlan();
});

function fillYear(value) {
  planStart.value = value + '-01-01';
  planEnd.value = value + '-12-31';
  feedback('settings-feedback');
}

$('this-year').addEventListener('click', () => fillYear(Number(today.slice(0, 4))));
$('next-year').addEventListener('click', () => fillYear(Number(today.slice(0, 4)) + 1));
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const allowance = $('allowance').valueAsNumber;
  const start = planStart.value;
  const end = planEnd.value;
  if (!validDate(start) || !validDate(end) || start > end || !validAllowance(allowance)) {
    feedback('settings-feedback', t('settingsInvalid'));
    return;
  }
  Object.assign(plan, { start, end, allowance });
  rangeAnchor = undefined;
  feedback('settings-feedback');
  persist();
  renderPlan();
  announce(t('saved', { remaining: numberFormat.format(summary.remaining) }));
});

$('planner-view').addEventListener('click', () => setView('plan'));
$('heatmap-view').addEventListener('click', () => setView('heatmap'));
finePointer.addEventListener('change', calendarHint);
$('view-year').addEventListener('change', event => {
  year = event.target.value;
  renderCalendar();
});
$('jump-month').addEventListener('change', event => {
  const value = event.target.value;
  if (!value) return;
  $('month-' + value).scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  const first = value + '-01';
  focusDay(first < plan.start ? plan.start : first);
  event.target.value = '';
});

months.addEventListener('focusin', event => {
  if (event.target.dataset.date) focusDay(event.target.dataset.date);
});
months.addEventListener('keydown', event => {
  const date = event.target.dataset.date;
  const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (!date || days === undefined) return;
  event.preventDefault();
  const target = shiftDate(date, days);
  if (inPeriod(plan, target)) revealDate(target);
});
months.addEventListener('click', event => {
  const date = event.target.closest('.day:not(:disabled)')?.dataset.date;
  if (!date || (event.detail && suppressClick)) return;
  focusDay(date);
  const holidays = holidaysOn(date);
  if (view === 'heatmap') {
    if (holidays.length) showHoliday(date, holidays);
    return;
  }
  if (event.shiftKey && rangeAnchor && inPeriod(plan, rangeAnchor)) {
    editRange(rangeAnchor, date, !blocksByDate.has(date));
    return;
  }
  rangeAnchor = date;
  if (blocksByDate.has(date)) editRange(date, date, false);
  else if (usesLeave(plan, date)) {
    editRange(date, date, true);
  } else {
    const applicable = holidays.filter(holiday => appliesTo(holiday, plan.region, plan.localHolidays));
    if (applicable.length) showHoliday(date, applicable);
    else announce(dayFormat.format(utcDate(date)) + ' · ' + t('offDay'));
  }
});

$('add-dates').addEventListener('click', () => openDateDialog());
$('date-form').addEventListener('submit', event => {
  event.preventDefault();
  const start = selectionStart.value;
  if (movingBlock) {
    const result = moveBlock(plan, movingBlock, start);
    if (result.error) {
      feedback('date-feedback', t(result.error));
      return;
    }
    $('date-dialog').close();
    updateDates(result.planned);
  } else {
    const end = selectionEnd.value;
    if (!validDate(start) || !validDate(end) || !inPeriod(plan, start) || !inPeriod(plan, end) || start > end) {
      feedback('date-feedback', t('outsideRange'));
      return;
    }
    $('date-dialog').close();
    editRange(start, end, true);
  }
  if (view !== 'plan') setView('plan');
  revealDate(start);
});
selectionStart.addEventListener('change', () => {
  if (!movingBlock && selectionEnd.value < selectionStart.value) selectionEnd.value = selectionStart.value;
});
$('blocks').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const block = blocksByDate.get(button.dataset.start);
  if (button.dataset.action === 'move') {
    openDateDialog(block);
  } else {
    editRange(block.start, block.end, false);
    const next = $('blocks').querySelector('button');
    if (next) next.focus();
    else $('planned-title').focus();
  }
});

function clearPreview() {
  for (const button of preview) button.classList.remove('preview');
  preview = [];
}

function cancelDrag() {
  if (drag?.active) suppressClick = true;
  clearPreview();
  months.classList.remove('dragging');
  drag = undefined;
}

function updateDragTarget(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.day:not(:disabled)');
  const date = target && months.contains(target) ? target.dataset.date : undefined;
  if (date === drag.target) return;
  clearPreview();
  drag.target = date;
  if (!date) return;
  let [start, end] = orderedDates(drag.origin, date);
  if (drag.block) {
    start = shiftDate(date, daysBetween(drag.origin, drag.block.start));
    end = shiftDate(start, daysBetween(drag.block.start, drag.block.end));
  }
  for (const key of daysIn(start, end)) {
    const button = dayButtons.get(key);
    if (button) {
      button.classList.add('preview');
      preview.push(button);
    }
  }
}

months.addEventListener('pointerdown', event => {
  suppressClick = false;
  const date = event.target.closest('.day:not(:disabled)')?.dataset.date;
  if (!date || view !== 'plan' || event.pointerType === 'touch' || event.button !== 0 || event.shiftKey) return;
  drag = { origin: date, id: event.pointerId, x: event.clientX, y: event.clientY, block: blocksByDate.get(date) };
});
window.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
  drag.active = true;
  months.classList.add('dragging');
  updateDragTarget(event);
});
window.addEventListener('pointerup', event => {
  if (drag?.id !== event.pointerId) return;
  if (drag.active) updateDragTarget(event);
  const { active, origin, target, block } = drag;
  cancelDrag();
  if (!active || !target || origin === target) return;
  focusDay(target);
  rangeAnchor = undefined;
  if (block) {
    const result = moveBlock(plan, block, shiftDate(target, daysBetween(origin, block.start)));
    if (result.error) feedback('calendar-feedback', t(result.error));
    else updateDates(result.planned);
  } else {
    editRange(origin, target, true);
  }
});
window.addEventListener('pointercancel', event => {
  if (drag?.id === event.pointerId) cancelDrag();
});
window.addEventListener('blur', cancelDrag);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && drag) cancelDrag();
});

$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = 'vacation-plan-' + plan.start + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback('backup-feedback', t('exported'));
});
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Backup too large');
    pendingImport = readPlan(await file.text());
  } catch {
    feedback('backup-feedback', t('importError'));
    return;
  }
  $('import-dialog').showModal();
});
$('confirm-import').addEventListener('click', () => {
  plan = pendingImport;
  $('import-dialog').close();
  year = '';
  focusedDate = undefined;
  rangeAnchor = undefined;
  persist();
  translate();
  renderSettings();
  renderPlan();
  feedback('backup-feedback', t('imported'));
});
$('import-dialog').addEventListener('close', () => { pendingImport = undefined; });
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => $(button.dataset.close).close());
}

translate();
renderSettings();
renderPlan();
