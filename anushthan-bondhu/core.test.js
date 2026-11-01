'use strict';
// Run with: npm test   (uses Node's built-in test runner, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');

const TODAY = '2026-11-01';
const TYPES = Object.keys(Core.EVENT_TYPES);

function sample(overrides) {
  const checked = Core.validateInput({
    eventType: 'puja', eventDate: '2027-01-20', headcount: 150, budget: 60000, diet: 'veg', lang: 'bn', notes: '',
    ...overrides,
  }, TODAY);
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));
  return checked.value;
}

// ---------------------------------------------------------------- validation
test('validateInput accepts a good request and fills defaults', () => {
  const r = Core.validateInput({ eventType: 'birthday', eventDate: '2026-12-05', headcount: '30', budget: '15000' }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.value.headcount, 30);
  assert.equal(r.value.diet, 'any');
  assert.equal(r.value.lang, 'bn');
});

test('validateInput reports every bad field and never throws on junk', () => {
  for (const junk of [null, undefined, 42, 'text', [], {}]) {
    const r = Core.validateInput(junk, TODAY);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.map((e) => e.field).sort(), ['budget', 'eventDate', 'eventType', 'headcount']);
  }
});

test('validateInput rejects out-of-range numbers, past dates and impossible dates', () => {
  const base = { eventType: 'puja', eventDate: '2027-01-20', headcount: 100, budget: 50000 };
  const fieldsFor = (patch) => Core.validateInput({ ...base, ...patch }, TODAY).errors.map((e) => e.field);
  assert.deepEqual(fieldsFor({ headcount: 2 }), ['headcount']);
  assert.deepEqual(fieldsFor({ headcount: 12.5 }), ['headcount']);
  assert.deepEqual(fieldsFor({ budget: 100 }), ['budget']);
  assert.deepEqual(fieldsFor({ budget: 'lots' }), ['budget']);
  assert.deepEqual(fieldsFor({ eventDate: '2026-10-31' }), ['eventDate']);
  assert.deepEqual(fieldsFor({ eventDate: '2026-02-30' }), ['eventDate']);
  assert.deepEqual(fieldsFor({ eventDate: '2030-01-01' }), ['eventDate']);
  assert.deepEqual(fieldsFor({ eventType: 'rocket_launch' }), ['eventType']);
});

test('validateInput cleans notes: control characters, extra spaces and length', () => {
  const r = Core.validateInput({ eventType: 'puja', eventDate: '2027-01-20', headcount: 100, budget: 50000, notes: '  a\u0000b \n\n c ' + 'x'.repeat(500) }, TODAY);
  assert.equal(r.value.notes.startsWith('a b c'), true);
  assert.equal(r.value.notes.length, Core.LIMITS.maxNotes);
  assert.equal(/[\u0000-\u001f]/.test(r.value.notes), false);
});

test('validateInput throws only for a malformed "today" (programming error)', () => {
  assert.throws(() => Core.validateInput({}, 'yesterday'), TypeError);
});

// -------------------------------------------------------------------- budget
test('every preset adds up to exactly 100 percent', () => {
  for (const type of TYPES) {
    const sum = Core.PRESETS[type].shares.reduce((s, [, pct]) => s + pct, 0);
    assert.equal(sum, 100, type);
  }
});

test('allocateBudget always adds up to the total, with no negative parts', () => {
  for (const type of TYPES) {
    for (const total of [2000, 2001, 9999, 12345, 50000, 77777, 123457, 10000000]) {
      const rows = Core.allocateBudget(total, type);
      assert.equal(rows.reduce((s, r) => s + r.amount, 0), total, `${type} ${total}`);
      assert.ok(rows.every((r) => Number.isInteger(r.amount) && r.amount >= 0));
    }
  }
});

test('allocateBudget keeps a contingency fund of about ten percent', () => {
  const rows = Core.allocateBudget(100000, 'college_fest');
  assert.equal(rows.find((r) => r.id === 'contingency').amount, 10000);
});

test('formatRupee uses Indian grouping and Bengali digits on request', () => {
  assert.equal(Core.formatRupee(1234567, 'en'), '₹12,34,567');
  assert.equal(Core.formatRupee(950, 'en'), '₹950');
  assert.equal(Core.formatRupee(60000, 'bn'), '₹৬০,০০০');
});

test('warns when the budget per guest or food per guest is too low', () => {
  const low = Core.buildPlan(sample({ headcount: 1000, budget: 30000 }), TODAY);
  const codes = low.warnings.map((w) => w.code);
  assert.ok(codes.includes('LOW_PER_HEAD'));
  assert.ok(codes.includes('LOW_FOOD_PER_HEAD'));
  const fine = Core.buildPlan(sample({ headcount: 100, budget: 100000 }), TODAY);
  assert.equal(fine.warnings.some((w) => w.code.startsWith('LOW_')), false);
});

// ------------------------------------------------------------------ timeline
test('every template lists dependencies first and never schedules a task before its dependency', () => {
  for (const type of TYPES) {
    const seen = new Set();
    const lead = {};
    for (const t of Core.TEMPLATES[type]) {
      lead[t.id] = t.dueBefore;
      for (const dep of t.dependsOn) {
        assert.ok(seen.has(dep), `${type}.${t.id} depends on ${dep} which is not listed earlier`);
        assert.ok(lead[dep] >= t.dueBefore, `${type}.${t.id} is due before ${dep}`);
      }
      seen.add(t.id);
    }
  }
});

test('every task category exists in the category list', () => {
  for (const type of TYPES) {
    for (const t of Core.TEMPLATES[type]) {
      if (t.category) assert.ok(Core.CATEGORIES[t.category], `${type}.${t.id}`);
    }
  }
});

test('plenty of time: tasks are sorted by date, none late, nothing compressed', () => {
  for (const type of TYPES) {
    const plan = Core.buildPlan(sample({ eventType: type, eventDate: '2027-03-01' }), TODAY);
    assert.equal(plan.compressed, false);
    assert.equal(plan.eventAtRisk, false);
    const dates = plan.tasks.map((t) => t.due);
    assert.deepEqual(dates, [...dates].sort());
    assert.ok(plan.tasks.every((t) => t.due <= plan.eventDate));
  }
});

test('little time: deadlines are compressed but still in dependency order and not in the past', () => {
  for (const type of TYPES) {
    const plan = Core.buildPlan(sample({ eventType: type, eventDate: '2026-11-10' }), TODAY);
    assert.equal(plan.compressed, true);
    const byId = Object.fromEntries(plan.tasks.map((t) => [t.id, t]));
    for (const t of plan.tasks) {
      assert.ok(t.due >= TODAY, `${type}.${t.id} is in the past`);
      for (const dep of t.dependsOn) assert.ok(byId[dep].due <= t.due, `${type}.${t.id} before ${dep}`);
    }
  }
});

test('event today: everything is due today and the tight-timeline warning appears', () => {
  const plan = Core.buildPlan(sample({ eventDate: TODAY }), TODAY);
  assert.ok(plan.tasks.every((t) => t.due === TODAY && t.status === 'today'));
  assert.ok(plan.warnings.some((w) => w.code === 'TIGHT_TIMELINE'));
});

// ------------------------------------------------------------------- re-plan
test('a small delay is absorbed by slack: only the delayed task moves', () => {
  const state = { input: sample({ eventDate: '2027-03-01' }), delays: {} };
  const out = Core.applyChange(state, { type: 'delay', taskId: 'permission', days: 5 }, TODAY);
  assert.equal(out.ok, true);
  assert.deepEqual(out.diff.tasks.map((t) => t.id), ['permission']);
});

test('a bigger delay pushes the tasks that depend on it, and only them', () => {
  const state = { input: sample({ eventDate: '2027-03-01' }), delays: {} };
  const out = Core.applyChange(state, { type: 'delay', taskId: 'permission', days: 20 }, TODAY);
  assert.equal(out.ok, true);
  const moved = out.diff.tasks.map((t) => t.id).sort();
  assert.deepEqual(moved, ['pandal', 'permission', 'sound']);
  assert.equal(out.plan.eventAtRisk, false);
});

test('a delay is applied exactly once and never lets a task finish before its dependency', () => {
  const state = { input: sample({ eventDate: '2027-03-01' }), delays: {} };
  const out = Core.applyChange(state, { type: 'delay', taskId: 'idol', days: 4 }, TODAY);
  const p = out.plan;
  const permission = p.tasks.find((t) => t.id === 'permission');
  const idol = p.tasks.find((t) => t.id === 'idol');
  assert.equal(idol.shiftDays, 4);
  assert.equal(permission.shiftDays, 0);
  for (const t of p.tasks) for (const dep of t.dependsOn) assert.ok(p.tasks.find((x) => x.id === dep).due <= t.due);
});

test('a huge delay flags the event as at risk', () => {
  const state = { input: sample({ eventDate: '2026-12-10' }), delays: {} };
  const out = Core.applyChange(state, { type: 'delay', taskId: 'committee', days: 60 }, TODAY);
  assert.equal(out.plan.eventAtRisk, true);
  assert.ok(out.plan.warnings.some((w) => w.code === 'EVENT_AT_RISK'));
  assert.ok(out.plan.tasks.some((t) => t.status === 'late'));
});

test('applyChange does not mutate the state it was given', () => {
  const state = { input: sample(), delays: { idol: 2 } };
  const snapshot = JSON.stringify(state);
  Core.applyChange(state, { type: 'delay', taskId: 'idol', days: 3 }, TODAY);
  Core.applyChange(state, { type: 'budget', budget: 90000 }, TODAY);
  assert.equal(JSON.stringify(state), snapshot);
});

test('cutting the budget lowers every category and may raise a warning', () => {
  const state = { input: sample({ headcount: 400, budget: 80000 }), delays: {} };
  const out = Core.applyChange(state, { type: 'budget', budget: 15000 }, TODAY);
  assert.equal(out.ok, true);
  assert.equal(out.plan.budget.total, 15000);
  assert.ok(out.diff.budget.length > 0 && out.diff.budget.every((b) => b.delta < 0));
  assert.ok(out.diff.newWarnings.some((w) => w.code === 'LOW_PER_HEAD'));
});

test('changing the event date moves the schedule', () => {
  const state = { input: sample({ eventDate: '2027-02-01' }), delays: {} };
  const out = Core.applyChange(state, { type: 'date', eventDate: '2027-02-15' }, TODAY);
  assert.equal(out.ok, true);
  assert.ok(out.diff.tasks.length > 0 && out.diff.tasks.every((t) => t.shiftDays === 14));
});

test('applyChange rejects bad changes with a message instead of throwing', () => {
  const state = { input: sample(), delays: {} };
  const bad = [
    { type: 'delay', taskId: 'nope', days: 3 },
    { type: 'delay', taskId: 'idol', days: 0 },
    { type: 'delay', taskId: 'idol', days: 9999 },
    { type: 'date', eventDate: '2020-01-01' },
    { type: 'budget', budget: 5 },
    { type: 'headcount', headcount: 'many' },
    { type: 'explode' },
    null,
  ];
  for (const change of bad) {
    const out = Core.applyChange(state, change, TODAY);
    assert.equal(out.ok, false, JSON.stringify(change));
    assert.ok(out.errors.length > 0);
  }
});

// -------------------------------------------------------------- AI-free assistant
test('fallbackAssist gives ideas, tips and a message for every type and language', () => {
  for (const type of TYPES) {
    for (const lang of ['bn', 'en']) {
      const input = sample({ eventType: type, lang });
      const out = Core.fallbackAssist(input, Core.buildPlan(input, TODAY));
      assert.ok(out.summary.length > 10);
      assert.ok(out.focus.length > 10);
      assert.equal(out.ideas.length, 5);
      assert.equal(out.savingTips.length, 3);
      assert.ok(out.messageDraft.length > 20);
    }
  }
});

test('the invitation message mentions the event date', () => {
  const input = sample({ eventDate: '2027-01-20', lang: 'en' });
  const out = Core.fallbackAssist(input, Core.buildPlan(input, TODAY));
  assert.ok(out.messageDraft.includes('20/01/2027'));
});

// ------------------------------------------------------------- context rules
test('rainy months add a rain warning, except for a birthday', () => {
  const july = Core.buildPlan(sample({ eventType: 'puja', eventDate: '2027-07-20' }), TODAY);
  assert.ok(july.warnings.some((w) => w.code === 'RAIN_RISK'));
  const birthday = Core.buildPlan(sample({ eventType: 'birthday', eventDate: '2027-07-20' }), TODAY);
  assert.equal(birthday.warnings.some((w) => w.code === 'RAIN_RISK'), false);
  const march = Core.buildPlan(sample({ eventType: 'puja', eventDate: '2027-03-20' }), TODAY);
  assert.equal(march.warnings.some((w) => w.code === 'RAIN_RISK'), false);
});

test('peak season flags only vendor tasks as "book early"', () => {
  const plan = Core.buildPlan(sample({ eventType: 'puja', eventDate: '2027-02-10' }), TODAY);
  assert.ok(plan.warnings.some((w) => w.code === 'PEAK_SEASON'));
  const byId = Object.fromEntries(plan.tasks.map((t) => [t.id, t]));
  assert.equal(byId.sound.earlyBook, true);
  assert.equal(byId.pandal.earlyBook, true);
  assert.equal(byId.committee.earlyBook, false);
  assert.equal(byId.permission.earlyBook, false);
  const off = Core.buildPlan(sample({ eventType: 'puja', eventDate: '2027-04-10' }), TODAY);
  assert.ok(off.tasks.every((t) => t.earlyBook === false));
  const wedding = Core.buildPlan(sample({ eventType: 'home_event', eventDate: '2026-12-20' }), TODAY);
  assert.ok(wedding.warnings.some((w) => w.code === 'PEAK_SEASON'));
});

test('volunteers: one per 25 guests, at least 4, only for crowd events', () => {
  assert.equal(Core.buildPlan(sample({ eventType: 'puja', headcount: 300 }), TODAY).volunteers, 12);
  assert.equal(Core.buildPlan(sample({ eventType: 'college_fest', headcount: 26 }), TODAY).volunteers, 4);
  assert.equal(Core.buildPlan(sample({ eventType: 'puja', headcount: 120 }), TODAY).volunteers, 5);
  assert.equal(Core.buildPlan(sample({ eventType: 'birthday', headcount: 300 }), TODAY).volunteers, null);
});

test('vegetarian-only adds a question to food tasks and to nothing else', () => {
  const veg = Core.buildPlan(sample({ diet: 'veg' }), TODAY);
  const any = Core.buildPlan(sample({ diet: 'any' }), TODAY);
  const foodVeg = veg.tasks.find((t) => t.id === 'food');
  const foodAny = any.tasks.find((t) => t.id === 'food');
  assert.equal(foodVeg.ask.en.length, foodAny.ask.en.length + 1);
  assert.ok(foodVeg.ask.en.at(-1).startsWith('Vegetarian only'));
  const other = veg.tasks.find((t) => t.id === 'sound');
  assert.deepEqual(other.ask, any.tasks.find((t) => t.id === 'sound').ask);
  const noAsk = Core.buildPlan(sample({ eventType: 'birthday', diet: 'veg' }), TODAY).tasks.find((t) => t.id === 'food');
  assert.ok(noAsk.ask.bn.length >= 1);
});

test('a date change into a rainy month raises the rain warning as a new warning', () => {
  const state = { input: sample({ eventDate: '2027-03-01' }), delays: {} };
  const out = Core.applyChange(state, { type: 'date', eventDate: '2027-08-01' }, TODAY);
  assert.ok(out.diff.newWarnings.some((w) => w.code === 'RAIN_RISK'));
});

// ------------------------------------------------------------------ exports
test('toICS makes a valid calendar: CRLF lines, short lines, one event per task plus the event day', () => {
  for (const lang of ['bn', 'en']) {
    const plan = Core.buildPlan(sample({ eventType: 'home_event', eventDate: '2027-03-01', lang }), TODAY);
    const ics = Core.toICS(plan, lang);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
    assert.equal(/[^\r]\n/.test(ics), false, 'every line break is CRLF');
    const physical = ics.split('\r\n').filter(Boolean);
    assert.ok(physical.every((line) => Buffer.byteLength(line, 'utf8') <= 75), 'lines are at most 75 octets');
    const unfolded = ics.replace(/\r\n /g, '');
    assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, plan.tasks.length + 1);
    assert.equal((unfolded.match(/END:VEVENT/g) || []).length, plan.tasks.length + 1);
    const uids = unfolded.match(/UID:.+/g);
    assert.equal(new Set(uids).size, uids.length, 'UIDs are unique');
    assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20270301'), 'the event day is in the file');
    assert.equal(ics.includes('\uFFFD'), false, 'no UTF-8 character was split');
  }
});

test('toICS escapes commas and semicolons in text', () => {
  const plan = Core.buildPlan(sample({ eventType: 'home_event', eventDate: '2027-03-01', lang: 'en' }), TODAY);
  const unfolded = Core.toICS(plan, 'en').replace(/\r\n /g, '');
  assert.ok(unfolded.includes('Family event (wedding\\, annaprashan)'));
});

test('foldLine keeps Bengali text intact when folded and unfolded', () => {
  const text = 'SUMMARY:' + 'অনুষ্ঠানের দিন '.repeat(12);
  const folded = Core.foldLine(text);
  assert.ok(folded.includes('\r\n '));
  assert.ok(folded.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  assert.equal(folded.replace(/\r\n /g, ''), text);
});

test('toText lists the budget and every task with its date', () => {
  const plan = Core.buildPlan(sample({ lang: 'en', eventDate: '2027-02-10' }), TODAY);
  const text = Core.toText(plan, 'en');
  assert.ok(text.includes('Budget') && text.includes('Task dates'));
  for (const t of plan.tasks) assert.ok(text.includes(Core.formatDate(t.due, 'en')));
  assert.ok(text.includes('(book early)'));
});

// -------------------------------------------------------- rule-based answers
test('answerFallback picks the topic from the question, in both languages', () => {
  const plan = Core.buildPlan(sample({ eventDate: '2027-02-10' }), TODAY);
  assert.ok(Core.answerFallback('বৃষ্টি হলে কী করব?', plan, 'bn').includes('ছাউনি'));
  assert.ok(Core.answerFallback('What if it rains?', plan, 'en').includes('indoor backup'));
  assert.ok(Core.answerFallback('বাজেট কম পড়লে কী ছাঁটব?', plan, 'bn').includes('ছাপা ও প্রচার'));
  assert.ok(Core.answerFallback('How do I cut the budget?', plan, 'en').includes('contingency'));
  assert.ok(Core.answerFallback('আগে কোনটা বুক করব?', plan, 'bn').includes('কমিটি গঠন'));
  assert.ok(Core.answerFallback('how many volunteers', plan, 'en').includes('volunteers'));
  assert.ok(Core.answerFallback('what about the weather', plan, 'en').includes('forecast'));
  assert.ok(Core.answerFallback('zzz', plan, 'en').includes('more specific'));
});

test('answerFallback uses real numbers from the plan', () => {
  const plan = Core.buildPlan(sample({ headcount: 300, eventDate: '2027-04-10' }), TODAY);
  assert.ok(Core.answerFallback('volunteers?', plan, 'en').includes('12'));
  assert.ok(Core.answerFallback('food', plan, 'en').includes('per guest'));
});