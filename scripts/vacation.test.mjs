import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysIn, validDate } from '../vacation/dates.js';
import { holidaysOn } from '../vacation/holidays.js';
import { defaultPlan, editDates, moveBlock, readPlan, summarize, usesLeave } from '../vacation/plan.js';

const makePlan = (overrides = {}) => ({ ...defaultPlan('2027-01-01', ['en']), ...overrides });

test('defaults use the current calendar year, the preferred supported language and a Monday–Friday workweek', () => {
  const plan = defaultPlan('2027-06-26', ['fr-FR', 'de-DE', 'en']);
  assert.equal(plan.language, 'de');
  assert.equal(plan.allowance, 30);
  assert.deepEqual(plan.workdays, [1, 2, 3, 4, 5]);
  assert.equal(plan.start, '2027-01-01');
  assert.equal(plan.end, '2027-12-31');
});

test('date ranges handle leap days, year boundaries and DST without local-time shifts', () => {
  assert.deepEqual([...daysIn('2028-02-28', '2028-03-01')], ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual([...daysIn('2026-12-31', '2027-01-02')], ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual([...daysIn('2027-03-27', '2027-03-29')], ['2027-03-27', '2027-03-28', '2027-03-29']);
  assert.equal(validDate('2027-02-29'), false);
  assert.equal(validDate('2027-2-28'), false);
});

test('the mapped dates and coverage distinguish nationwide, state and municipal holidays', () => {
  assert.deepEqual(holidaysOn('2027-05-06').map(day => [day.name, day.regions.length]), [['ascension', 16]]);
  assert.deepEqual(holidaysOn('2027-11-17').map(day => [day.name, day.regions]), [['repentance', ['SN']]]);
  assert.equal(holidaysOn('2027-05-27')[0].regions.length, 6);
  assert.deepEqual(holidaysOn('2027-08-08')[0].regions, []);
  assert.deepEqual(holidaysOn('2027-08-08')[0].local, ['BY']);
  assert.equal(holidaysOn('2028-06-17')[0].name, 'uprising');
  assert.equal(holidaysOn('2029-06-17').length, 0);
});

test('holiday eligibility follows the workweek, state and local choices', () => {
  assert.equal(usesLeave(makePlan(), '2027-05-27'), true);
  assert.equal(usesLeave(makePlan({ region: 'BW' }), '2027-05-27'), false);
  assert.equal(usesLeave(makePlan({ region: 'SN' }), '2027-05-27'), true);
  assert.equal(usesLeave(makePlan({ region: 'SN', localHolidays: ['corpusChristi'] }), '2027-05-27'), false);
  assert.equal(usesLeave(makePlan({ region: 'BY', workdays: [0] }), '2027-08-15'), true);
  assert.equal(usesLeave(makePlan({ region: 'BY', workdays: [0], localHolidays: ['assumption'] }), '2027-08-15'), false);
  assert.equal(usesLeave(makePlan({ region: 'BB', workdays: [0] }), '2027-03-28'), false);
  assert.equal(usesLeave(makePlan({ region: 'BE', workdays: [0] }), '2027-03-28'), true);
});

test('summaries count eligible dates only, preserve hidden dates and support an overdrawn balance', () => {
  const planned = editDates([], '2027-05-26', '2027-05-31', true);
  const plan = makePlan({ start: '2027-05-27', region: 'BW', planned, allowance: 1 });
  assert.deepEqual(summarize(plan), {
    blocks: [{ start: '2027-05-27', end: '2027-05-31', days: 5, used: 2 }],
    used: 2, outside: 1, remaining: -1
  });
  assert.equal(summarize({ ...plan, start: '2027-05-26' }).used, 3);
  assert.deepEqual(editDates(planned, '2027-05-27', '2027-05-30', false), ['2027-05-26', '2027-05-31']);
});

test('moving a block preserves duration, recalculates leave, and rejects collisions or dates outside the period', () => {
  const planned = ['2027-01-01', '2027-05-05', '2027-05-06', '2027-05-07', '2027-05-12'];
  const plan = makePlan({ start: '2027-05-01', planned });
  const block = summarize(plan).blocks[0];
  const moved = moveBlock(plan, block, '2027-05-10');
  assert.deepEqual(moved, { error: 'overlap' });
  assert.deepEqual(moveBlock(plan, block, '2027-12-30'), { error: 'outsideRange' });
  assert.deepEqual(moveBlock(plan, block, '2027-05-06'), {
    planned: ['2027-01-01', '2027-05-06', '2027-05-07', '2027-05-08', '2027-05-12'],
    end: '2027-05-08'
  });
  assert.equal(summarize({ ...plan, planned: moveBlock(plan, block, '2027-05-06').planned }).used, 2);
});

test('versioned backups round-trip settings and dates, and reject malformed records', () => {
  const original = makePlan({
    language: 'de', region: 'BY', localHolidays: ['augsburg'], workdays: [1, 2, 3, 4, 6],
    allowance: 20, start: '2027-08-01', end: '2028-01-04', planned: ['2027-08-07', '2027-08-08', '2028-01-02']
  });
  assert.deepEqual(readPlan(JSON.stringify(original)), original);
  assert.deepEqual(readPlan(JSON.stringify({ ...original, planned: ['2028-01-02', '2027-08-08', '2028-01-02'] })).planned,
    ['2027-08-08', '2028-01-02']);
  for (const invalid of [
    { version: 2 }, { region: 'XX' }, { localHolidays: ['corpusChristi'] }, { language: 'fr' },
    { allowance: -1 }, { workdays: [7] }, { end: '2027-02-31' }, { end: '2027-01-01' }, { planned: ['2028-02-30'] }
  ]) assert.throws(() => readPlan(JSON.stringify({ ...original, ...invalid })), /Invalid vacation plan/);
  assert.throws(() => readPlan('this is not JSON'), SyntaxError);
});
