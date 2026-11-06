/* eslint-disable @typescript-eslint/no-require-imports -- These tests run directly in Node.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { events, eventById, validateEvents, matchesSubject, eventSubjectLabel } = require('../lib/events.ts');
const { DEFAULT_SETTINGS, filterEvents, makeQueue, recordAttempt, weakness } = require('../lib/study.ts');
const audit = require('../data/sources/japanese-history-import.json');
const settings = (extra = {}) => ({ ...structuredClone(DEFAULT_SETTINGS), ...extra });

test('all 274 CSV rows are accounted for, with notes, years, stable IDs and no duplicate additions', () => {
  const lines = fs.readFileSync(path.join(__dirname, '../data/sources/japanese_history_years.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  // This supplied CSV has no quoted fields or embedded commas. Fail if that changes.
  assert.ok(lines.every(line => !line.includes('"') && line.split(',').length === 5));
  const rows = lines.slice(1).map(line => { const [id, year, name, note] = line.split(','); return { id, year: Number(year), name, note }; });
  assert.equal(rows.length, 274);
  assert.equal(audit.rows.length, rows.length);
  assert.equal(new Set(audit.rows.map(row => row.sourceId)).size, rows.length);
  const added = audit.rows.filter(row => row.status === 'added');
  const duplicates = audit.rows.filter(row => row.status === 'duplicate');
  assert.equal(added.length, 236);
  assert.equal(duplicates.length, 38);
  assert.equal(events.length, audit.originalEventCount + added.length);
  assert.equal(new Set(added.map(row => row.eventId)).size, added.length);
  for (const row of rows) {
    const record = audit.rows.find(item => item.sourceId === row.id);
    const event = eventById.get(record.eventId);
    assert.ok(event, row.id);
    assert.equal(event.year, row.year, row.id);
    assert.equal(event.era, 'CE');
    assert.equal(record.originalName, row.name);
    assert.ok(matchesSubject(event, 'japan'), row.id);
    if (row.note) assert.ok(event.note?.includes(row.note), row.id);
    assert.equal(event.priority, record.priority);
    assert.ok(record.priorityReason && eventById.has(record.calibrationEventId));
    assert.ok(record.referenceIds.every(id => audit.references[id]?.url.startsWith('https://')));
    assert.ok(record.referenceIds.length || record.status === 'duplicate');
    if (record.status === 'added') {
      assert.ok(!event.draftLines);
      assert.equal(event.id, `jp-import-${row.id.toLowerCase()}`);
      assert.equal(event.priority, eventById.get(record.calibrationEventId).priority);
    } else {
      assert.ok(event.draftLines?.length, `existing ID retained: ${row.id}`);
      assert.ok(!eventById.has(`jp-import-${row.id.toLowerCase()}`));
    }
  }
  assert.equal(events.filter(event => event.name.includes('近衛声明')).length, 1);
  for (const id of ['JP0253', 'JP0254', 'JP0255']) assert.equal(audit.rows.find(row => row.sourceId === id).status, 'duplicate');
  assert.ok(eventById.has('jp-import-jp0224'), 'Versailles treaty is distinct from Paris conference');
  for (const id of ['jp-import-jp0268', 'jp-import-jp0271', 'jp-import-jp0272', 'jp-import-jp0273', 'jp-import-jp0274']) assert.ok(eventById.has(id), 'distinct 1945 milestones are retained');
});

test('shared events work through subject, unit and region filters with one queue entry and one history', () => {
  const event = eventById.get('wh-211ff69a85b8'); // Existing world-history question: 文禄の役.
  assert.equal(event.subject, 'world');
  assert.equal(eventSubjectLabel(event), '世界史・日本史');
  for (const subject of ['japan', 'world', 'both']) {
    assert.deepEqual(filterEvents([event, event], settings({ subject }), {}), [event]);
    assert.deepEqual(makeQueue([event, event], settings({ subject, count: 'all', scopeMethod: 'units', unitIds: ['W10-06', 'J07-04'], balanced: true }), {}), [event]);
  }
  for (const [subject, unitId] of [['japan', 'J07-04'], ['world', 'W10-06']]) {
    assert.deepEqual(filterEvents([event], settings({ subject, scopeMethod: 'units', unitIds: [unitId] }), {}), [event]);
  }
  assert.deepEqual(filterEvents([event], settings({ subject: 'japan', scopeMethod: 'units', unitIds: ['J02-01', 'W10-06'] }), {}), [], 'hidden units from the other subject must not match');
  for (const [subject, regionId, period] of [['japan', 'japan', 'japan-10'], ['world', 'china', 'china-08']]) {
    assert.deepEqual(filterEvents([event], settings({ subject, scopeMethod: 'region', regionId, startPeriodId: period, endPeriodId: period }), {}), [event]);
  }
  const history = { [event.id]: recordAttempt(undefined, { eventId: event.id, mode: 'exact', correct: false, input: '', era: 'CE', at: '2026-11-06T00:00:00Z' }) };
  assert.ok(weakness(history[event.id]) > 0);
  for (const subject of ['japan', 'world']) assert.deepEqual(filterEvents([event], settings({ subject, statuses: ['review'] }), history), [event]);
  assert.equal(Object.keys(history).length, 1);
});

test('shared-subject metadata is validated while legacy questions keep their subject restrictions', () => {
  const event = eventById.get('wh-211ff69a85b8');
  assert.doesNotThrow(() => validateEvents([event]));
  for (const subjects of [[], ['world', 'world'], ['japan'], ['world', 'unknown'], 'both']) assert.throws(() => validateEvents([{ ...event, subjects }]));
  assert.throws(() => validateEvents([{ ...event, regions: ['unknown'] }]));
  assert.throws(() => validateEvents([{ ...event, relatedUnitIds: ['unknown'] }]));
  assert.throws(() => validateEvents([{ ...event, subjects: undefined }]));
  const legacy = eventById.get('jp-1889');
  assert.equal(matchesSubject(legacy, 'japan'), true);
  assert.equal(matchesSubject(legacy, 'world'), false);
  assert.equal(eventSubjectLabel(legacy), '日本史');
});

test('competing date conventions keep the CSV year and explain what is being asked', () => {
  for (const [id, year, name] of [['jp-import-jp0005', 538, '元興寺縁起'], ['jp-import-jp0036', 858, '事実上'], ['jp-import-jp0065', 1334, '改元'], ['jp-import-jp0097', 1614, '西暦換算'], ['jp-import-jp0230', 1922, '北樺太を除く']]) {
    const event = eventById.get(id);
    assert.equal(event.year, year);
    assert.ok(event.name.includes(name));
    assert.ok(event.note);
  }
});

test('new question prompts do not disclose their answer year', () => {
  for (const row of audit.rows.filter(row => row.status === 'added')) {
    const event = eventById.get(row.eventId);
    assert.ok(!event.name.includes(String(event.year)), event.id);
  }
});
