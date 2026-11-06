/* eslint-disable @typescript-eslint/no-require-imports -- Emulator tests run in Node.js. */
// Run against a demo project only; never writes to the connected production project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, query, where, limit, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const projectId = 'demo-history-dates';
const id = 'ABCDEFGHIJKLMNOPQRST';
const id2 = 'ZYXWVUTSRQPONMLKJIHG';
const payload = () => ({ name: 'Emulator-only event', year: 1600, era: 'CE', subject: 'japan', unitId: '', regionId: 'japan', duplicateChecked: true, note: '', priority: 3, reviewStatus: 'unverified', createdAt: serverTimestamp() });

test('Firestore enforces public states, validation, atomic rate limits and private reports', { timeout: 60000 }, async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with firebase emulators:exec --project demo-history-dates');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'Emulator must be local');
  const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') } });
  const db = env.authenticatedContext('poster').firestore();
  const other = env.authenticatedContext('other').firestore();
  const guest = env.unauthenticatedContext().firestore();
  async function post(database, uid, docId, changes = {}) {
    const batch = writeBatch(database);
    batch.set(doc(database, 'submissionLimits', uid), { lastAt: serverTimestamp(), submissionId: docId });
    batch.set(doc(database, 'submissions', docId), { ...payload(), ...changes });
    return batch.commit();
  }
  try {
    await env.clearFirestore();
    await assertFails(setDoc(doc(guest, 'submissions', id), payload()));
    await assertFails(setDoc(doc(db, 'submissions', id), payload()));
    await assertSucceeds(post(db, 'poster', id));
    await assertSucceeds(getDoc(doc(guest, 'submissions', id)));
    await assertSucceeds(getDocs(query(collection(guest, 'submissions'), where('reviewStatus', 'in', ['verified', 'unverified']), limit(500))));
    const sameYear = await assertSucceeds(getDocs(query(collection(guest, 'submissions'), where('reviewStatus', 'in', ['unverified', 'verified']), where('year', '==', 1600), where('era', '==', 'CE'), limit(500))));
    assert.equal(sameYear.size, 1);
    await assertFails(getDocs(collection(guest, 'submissions')));
    await assertFails(getDocs(query(collection(guest, 'submissions'), limit(500))));
    await assertFails(getDocs(query(collection(guest, 'submissions'), where('reviewStatus', '==', 'unverified'), limit(501))));
    await assertFails(updateDoc(doc(db, 'submissions', id), { reviewStatus: 'verified' }));
    await assertFails(deleteDoc(doc(db, 'submissions', id)));
    await assertFails(getDoc(doc(other, 'submissionLimits', 'poster')));
    await assertFails(post(db, 'poster', id2));
    await assertFails(post(other, 'poster', id2));
    const invalid = [{ reviewStatus: 'verified' }, { reviewStatus: 'hidden' }, { priority: 0 }, { priority: 6 }, { priority: 1.5 }, { priority: '3' }, { priority: null }, { year: 0 }, { year: 1.5 }, { year: 10000 }, { name: '' }, { name: ' ' }, { name: 'a'.repeat(161) }, { note: 'a'.repeat(1001) }, { duplicateChecked: false }, { duplicateChecked: 'true' }, { source: 'https://example.org/source' }, { regionId: 'europe' }, { unitId: 'W01-01' }, { createdAt: Timestamp.fromMillis(0) }, { author: 'private information' }];
    for (let i = 0; i < invalid.length; i++) {
      const uid = 'invalid-' + i;
      await assertFails(post(env.authenticatedContext(uid).firestore(), uid, id2, invalid[i]));
    }
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissionLimits', 'poster'), { lastAt: Timestamp.fromMillis(Date.now() - 61000), submissionId: id });
    });
    await assertSucceeds(post(db, 'poster', id2, { priority: 5 }));
    assert.equal((await getDoc(doc(guest, 'submissions', id2))).data().priority, 5);
    for (const priority of [1, 2, 3, 4]) {
      const uid = 'priority-' + priority;
      const docId = 'PriorityABCDEFGHIJK' + priority;
      await assertSucceeds(post(env.authenticatedContext(uid).firestore(), uid, docId, { priority }));
      await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'submissions', docId)); });
    }
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'submissions', id), { reviewStatus: 'hidden' });
    });
    await assertFails(getDoc(doc(guest, 'submissions', id)));
    const visible = await assertSucceeds(getDocs(query(collection(guest, 'submissions'), where('reviewStatus', 'in', ['verified', 'unverified']), limit(500))));
    assert.deepEqual(visible.docs.map((item) => item.id), [id2]);
    const reportId = 'ReportABCDEFGHIJKLMN';
    async function report(reportDocId, eventId = id2, reason = 'incorrect', detail = '') {
      const batch = writeBatch(db);
      batch.set(doc(db, 'reportLimits', 'poster'), { lastAt: serverTimestamp(), reportId: reportDocId });
      batch.set(doc(db, 'reports', reportDocId), { eventId, reason, detail, createdAt: serverTimestamp() });
      return batch.commit();
    }
    await assertFails(report(reportId, id)); // hidden posts cannot be reported
    await assertFails(report(reportId, id2, 'unknown'));
    await assertFails(report(reportId, id2, 'incorrect', 'a'.repeat(501)));
    await assertSucceeds(report(reportId));
    await assertFails(getDoc(doc(db, 'reports', reportId)));
    await assertFails(getDocs(collection(other, 'reports')));
    await assertFails(report('ReportZYXWVUTSRQPONM'));
    await assertFails(setDoc(doc(db, 'submissionLimits', 'poster'), { lastAt: serverTimestamp(), submissionId: 'MissingABCDEFGHIJKLM' }));
  } finally { await env.cleanup(); }
});
