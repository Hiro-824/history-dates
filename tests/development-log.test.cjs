/* eslint-disable @typescript-eslint/no-require-imports -- Tests run directly in Node.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { developmentLog } = require('../data/development-log.ts');
const { hasUnreadLog, readLogIds, markDevelopmentLogRead, DEVELOPMENT_LOG_STORAGE_KEY } = require('../lib/development-log.ts');
const { submissionUpdates, mergeDevelopmentLogs } = require('../lib/submission-updates.ts');
const fixture = { id: 'test-only-log', date: '2026-11-06', title: 'テスト', body: 'テスト用の一時データ' };

test('read IDs survive reloads, isolate browsers, and flag newly added logs regardless of date', () => {
  const storage = new Map();
  const previous = global.window;
  developmentLog.push(fixture);
  global.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, dispatchEvent: () => {} };
  try {
    assert.ok(hasUnreadLog(null));
    markDevelopmentLogRead();
    const saved = storage.get(DEVELOPMENT_LOG_STORAGE_KEY);
    assert.equal(hasUnreadLog(saved), false);
    assert.equal(hasUnreadLog(JSON.parse(JSON.stringify(saved))), false);
    assert.ok(hasUnreadLog(null), 'a different browser remains unread');
    developmentLog.push({ id: 'new-log', date: '2026-01-01', title: '追加', body: '内容' });
    try {
      assert.ok(hasUnreadLog(saved));
      markDevelopmentLogRead();
      assert.equal(hasUnreadLog(storage.get(DEVELOPMENT_LOG_STORAGE_KEY)), false);
    } finally { developmentLog.pop(); }
  } finally { global.window = previous; developmentLog.pop(); }
});

test('invalid saved data recovers as unread and an empty log never signals an update', () => {
  developmentLog.push(fixture);
  try {
  for (const value of [null, '{', '{}', 'null', '123']) {
    assert.deepEqual(readLogIds(value), []);
    assert.ok(hasUnreadLog(value));
  }
  assert.deepEqual(readLogIds('["known",1,null]'), ['known']);
  const entries = developmentLog.splice(0);
  try { assert.equal(hasUnreadLog(null), false); }
  finally { developmentLog.push(...entries); }
  } finally { developmentLog.pop(); }
});

test('submission updates use Japanese dates, stable IDs and newest-first ordering without review labels', () => {
  const event = { ...require('../data/events.json')[0], id: 'community-ABCDEFGHIJKLMNOPQRST', name: '投稿された出来事', year: 1990, era: 'CE', reviewStatus: 'unverified' };
  const first = { event, createdAt: '2026-11-05T16:00:00.000Z' };
  const newer = { event: { ...event, id: 'community-ZYXWVUTSRQPONMLKJIHG', name: '別の出来事', era: 'BCE', year: 221 }, createdAt: '2026-11-06T01:00:00.000Z' };
  const logs = submissionUpdates([first, newer, first, { event, createdAt: 'broken' }, { event: { ...event, id: 'builtin', reviewStatus: undefined }, createdAt: first.createdAt }, { event: { ...event, reviewStatus: 'hidden' }, createdAt: first.createdAt }]);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].body, '紀元前221年「別の出来事」を追加しました。');
  assert.equal(logs[1].body, '1990年「投稿された出来事」を追加しました。');
  assert.equal(logs[1].date, '2026-11-06');
  assert.doesNotMatch(JSON.stringify(logs), /未確認|確認済み/);
  const confirmed = submissionUpdates([{ ...first, event: { ...event, reviewStatus: 'verified' } }]);
  assert.deepEqual(confirmed, [logs[1]]);
  assert.deepEqual(mergeDevelopmentLogs([fixture], [logs[0], logs[1], logs[1]]).map(entry => entry.id), [logs[0].id, logs[1].id, fixture.id]);
});

test('automatically generated updates participate in read tracking without writing static articles', () => {
  const storage = new Map();
  const previous = global.window;
  const entries = [fixture, { ...fixture, id: 'submission-community-ABCDEFGHIJKLMNOPQRST' }];
  global.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, dispatchEvent: () => {} };
  try {
    assert.equal(hasUnreadLog(null, entries), true);
    markDevelopmentLogRead(entries);
    const saved = storage.get(DEVELOPMENT_LOG_STORAGE_KEY);
    assert.equal(hasUnreadLog(saved, entries), false);
    assert.equal(hasUnreadLog(saved, [...entries, { ...fixture, id: 'new-submission' }]), true);
    assert.equal(hasUnreadLog(saved, entries.slice(0, 1)), false);
  } finally { global.window = previous; }
});
