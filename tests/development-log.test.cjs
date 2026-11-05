/* eslint-disable @typescript-eslint/no-require-imports -- Tests run directly in Node.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { developmentLog } = require('../data/development-log.ts');
const { hasUnreadLog, readLogIds, markDevelopmentLogRead, DEVELOPMENT_LOG_STORAGE_KEY } = require('../lib/development-log.ts');
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
