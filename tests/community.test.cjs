/* eslint-disable @typescript-eslint/no-require-imports -- Node tests transpile the shared TypeScript modules. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { communityEvent, validateSubmission, restoreCommunityEvent, mergeEvents, sameYearEvents } = require('../lib/community.ts');
const { DEFAULT_SETTINGS, filterEvents, submitSession, advanceSession } = require('../lib/study.ts');
const { restoreSettings, decodeStore, startStudy, updateStore } = require('../lib/storage.ts');
const { events } = require('../lib/events.ts');
const { units } = require('../data/units.ts');
const { regions } = require('../data/regions.ts');
const id = 'ABCDEFGHIJKLMNOPQRST';
const input = { name: 'テスト用の出来事', year: 1600, era: 'CE', subject: 'japan', unitId: '', regionId: 'japan', duplicateChecked: true, note: '' };
const data = { ...input, priority: 3, reviewStatus: 'unverified' };

test('community input validates dates, required duplicate review, classifications and published states', () => {
  assert.equal(validateSubmission({ ...input, name: '  出来事  ' }).name, '出来事');
  for (const bad of [{ year: 0 }, { year: 1.5 }, { year: 10000 }, { year: '1600' }, { name: ' ' }, { name: 'a'.repeat(161) }, { era: 'other' }, { subject: 'both' }, { regionId: 'europe' }, { unitId: 'W01-01' }, { duplicateChecked: false }, { duplicateChecked: undefined }, { duplicateChecked: 'true' }, { note: 'a'.repeat(1001) }]) {
    assert.throws(() => validateSubmission({ ...input, ...bad }), JSON.stringify(bad));
  }
  const event = communityEvent(id, data);
  assert.equal(event.id, 'community-' + id);
  assert.equal(event.period, '投稿（未分類）');
  assert.equal(event.priority, 3);
  for (const bad of [{ reviewStatus: 'hidden' }, { priority: 9 }, { note: 123 }, { duplicateChecked: false }, { year: '1600' }, { unitId: 'broken' }]) assert.equal(communityEvent(id, { ...data, ...bad }), null);
  assert.equal(communityEvent('../bad', data), null);
  assert.deepEqual(restoreCommunityEvent(event), event);
});
test('unverified questions default off across every scope; confirmed questions keep their IDs and history', () => {
  const unverified = communityEvent(id, { ...data, unitId: 'J06-01' });
  const verified = communityEvent(id, { ...data, unitId: 'J06-01', reviewStatus: 'verified' });
  const base = { ...DEFAULT_SETTINGS, unitIds: ['J06-01'], regionId: 'japan', startPeriodId: 'japan-01', endPeriodId: 'japan-20' };
  for (const scopeMethod of ['units', 'region', 'random']) {
    assert.equal(filterEvents([unverified], { ...base, scopeMethod }, {}).length, 0);
    assert.equal(filterEvents([unverified], { ...base, scopeMethod, includeUnverified: true }, {}).length, 1);
    assert.equal(filterEvents([verified], { ...base, scopeMethod }, {}).length, 1);
  }
  const unclassified = communityEvent(id, data);
  assert.equal(filterEvents([unclassified], { ...base, scopeMethod: 'units', includeUnverified: true }, {}).length, 0);
  assert.equal(filterEvents([unclassified], { ...base, scopeMethod: 'random', includeUnverified: true }, {}).length, 1);
  assert.equal(unverified.id, verified.id);
  assert.equal(restoreSettings({}).includeUnverified, false);
  assert.equal(restoreSettings({ includeUnverified: true }).includeUnverified, true);
  assert.equal(restoreSettings({ includeUnverified: 'yes' }).includeUnverified, false);
});
test('optional submission priority defaults to three and preserves every valid choice through study filters', () => {
  assert.equal(validateSubmission(input).priority, 3);
  for (const priority of [1, 2, 3, 4, 5]) {
    assert.equal(validateSubmission({ ...input, priority }).priority, priority);
    const event = communityEvent(id, { ...data, priority });
    assert.equal(event.priority, priority);
    const settings = { ...DEFAULT_SETTINGS, includeUnverified: true, priorities: [priority] };
    assert.equal(filterEvents([event], settings, {}).length, 1);
    assert.equal(filterEvents([event], { ...settings, priorities: [priority === 5 ? 1 : 5] }, {}).length, 0);
  }
  for (const priority of [0, 6, 1.5, '3', null, NaN]) assert.throws(() => validateSubmission({ ...input, priority }));
});
test('same-year review includes both subjects and unverified posts while separating CE and BCE', () => {
  const posted = communityEvent(id, data);
  const builtin = events.find(event => event.year === 1600 && event.era === 'CE');
  const world = { ...builtin, id: 'same-year-world', subject: 'world' };
  const oppositeEra = { ...posted, id: 'opposite-era', era: 'BCE' };
  assert.deepEqual(sameYearEvents([builtin, world, posted, posted, oppositeEra], 1600, 'CE').map(event => event.id), [builtin.id, world.id, posted.id]);
  assert.deepEqual(sameYearEvents([posted, oppositeEra], 1600, 'BCE').map(event => event.id), [oppositeEra.id]);
  assert.deepEqual(sameYearEvents([posted], 1601, 'CE'), []);
});
test('posted questions persist in sessions without a network and restricted review honors opt-in', () => {
  const memory = new Map();
  global.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const event = communityEvent(id, data);
  updateStore(() => ({ version: 2, settings: { ...DEFAULT_SETTINGS }, history: {}, recent: [], presets: [], sessions: [] }));
  assert.equal(startStudy(DEFAULT_SETTINGS, [event.id], false, [event]), null);
  const session = startStudy({ ...DEFAULT_SETTINGS, includeUnverified: true }, [event.id], false, [event]);
  assert.deepEqual(session.eventSnapshots, [event]);
  const restored = decodeStore(memory.get('history-dates:v2'));
  assert.deepEqual(restored.sessions[0].eventSnapshots, [event]);
  const answered = submitSession(restored, session.id, 0, restored.sessions[0].eventSnapshots[0], new Date().toISOString(), true);
  assert.equal(answered.history[event.id].incorrect, 1);
  const finished = advanceSession(answered, session.id, 0);
  assert.equal(finished.sessions[0].stage, 'finished');
  const tampered = structuredClone(restored);
  tampered.sessions[0].eventSnapshots[0].year = 0;
  assert.equal(decodeStore(JSON.stringify(tampered)).sessions[0].eventSnapshots.length, 0);
  assert.equal(mergeEvents(events, [event, event]).filter((e) => e.id === event.id).length, 1);
});
test('Firestore classification allowlists cover the same units and regions as the app', () => {
  const rules = fs.readFileSync(require('node:path').join(__dirname, '../firestore.rules'), 'utf8');
  for (const item of [...units, ...regions]) assert.ok(rules.includes('"' + item.id + '"'), item.id);
});
