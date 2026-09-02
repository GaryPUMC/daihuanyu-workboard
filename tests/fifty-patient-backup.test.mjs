import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFiftyPatientBenchmark } from './fixtures/fifty-patient-benchmark.mjs';

const secureSource = fs.readFileSync(new URL('../utils/secure-backup.js', import.meta.url), 'utf8');
const secure = await import(`data:text/javascript;base64,${Buffer.from(secureSource).toString('base64')}`);
const patientDraftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const patientDraftUrl = `data:text/javascript;base64,${Buffer.from(patientDraftSource).toString('base64')}`;
const storeSource = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8')
  .replace("from './patient-draft'", `from '${patientDraftUrl}'`);
const storage = new Map();

function toArrayBuffer(base64) {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  getRandomValues: ({ length, success }) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    const result = { randomValues: bytes.buffer.slice(0) };
    if (success) success(result);
    return result;
  },
  arrayBufferToBase64: (buffer) => Buffer.from(buffer).toString('base64'),
  base64ToArrayBuffer: toArrayBuffer,
};

const store = await import(`data:text/javascript;base64,${Buffer.from(storeSource).toString('base64')}`);
const password = 'Demo50-2026!';
const content = await secure.encryptBackup(createFiftyPatientBenchmark(), password);
const decoded = secure.decryptBackup(content, password);
const prepared = store.prepareBackupImport(decoded);

assert.equal(prepared.integrity.ok, true);
assert.equal(prepared.workspace.patients.length, 44);
assert.equal(prepared.workspace.archivedPatients.length, 6);
assert.equal(prepared.workspace.patients.length + prepared.workspace.archivedPatients.length, 50);
assert.throws(() => secure.decryptBackup(content, 'Wrong-Password!'), /密码错误/);

console.log('50-patient encrypted backup recovery: passed');
