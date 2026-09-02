import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIFTY_PATIENT_SCENARIOS, createFiftyPatientBenchmark } from './fixtures/fifty-patient-benchmark.mjs';

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const source = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const benchmark = createFiftyPatientBenchmark();
const allSourcePatients = [...benchmark.patients, ...benchmark.archivedPatients];

assert.equal(FIFTY_PATIENT_SCENARIOS.length, 50);
assert.equal(new Set(FIFTY_PATIENT_SCENARIOS.map((item) => item.id)).size, 50);
assert.deepEqual(FIFTY_PATIENT_SCENARIOS.reduce((counts, item) => ({ ...counts, [item.patientType]: (counts[item.patientType] || 0) + 1 }), {}), { 普通: 25, 国疗: 15, 日间: 10 });
assert.deepEqual(FIFTY_PATIENT_SCENARIOS.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {}), { 在院: 38, 出院待归档: 6, 已归档: 6 });
assert.equal(new Set(FIFTY_PATIENT_SCENARIOS.map((item) => item.department)).size, 7);
assert.equal(new Set(FIFTY_PATIENT_SCENARIOS.map((item) => item.focus)).size >= 10, true);
assert.equal(allSourcePatients.filter((patient) => patient.patientType === '日间').every((patient) => patient.admissionDate === patient.surgeryDate && patient.surgeryDate === patient.plannedDischargeDate && (!patient.actualDischargeDate || patient.actualDischargeDate === patient.admissionDate)), true);

const prepared = store.prepareBackupImport(benchmark);
assert.equal(prepared.integrity.ok, true);
assert.equal(prepared.workspace.patients.length, 44);
assert.equal(prepared.workspace.archivedPatients.length, 6);
storage.set('daihuanyu_workboard_local_v3', structuredClone(prepared.workspace));
assert.equal(store.getWorkspaceIntegrity().ok, true);

const activePatients = store.getWorkspace().patients;
const dischargedPatients = activePatients.filter((patient) => store.getPatientStatus(patient) === '已出院');
assert.equal(dischargedPatients.length, 6);
assert.equal(store.getActiveTasks().every((task) => store.getPatientStatus(store.getPatient(task.patientId)) !== '已出院'), true);
assert.equal(store.getPatientBundle('QA-BENCH-001').rounds.length > 0, true);
assert.equal('stageLogs' in store.getPatientBundle('QA-BENCH-007'), false);
assert.equal(store.getWorkspace().stageLogs.some((item) => item.patientId === 'QA-BENCH-007'), true);
assert.equal(Boolean(store.getWorkspace().legacyWorkflow), true);
assert.equal(store.getActiveTasks().every((task) => task.source !== '阶段要求' && task.source !== '路径建议'), true);
assert.equal(activePatients.filter((patient) => patient.patientType === '日间').every((patient) => patient.admissionDate === patient.surgeryDate && patient.surgeryDate === patient.plannedDischargeDate && (!patient.actualDischargeDate || patient.actualDischargeDate === patient.admissionDate)), true);

const manualTask = store.addTask('QA-BENCH-002', { title: '50人基准任务', sourceRef: 'benchmark:unique-task' });
assert.equal(manualTask.ok, true);
assert.equal(store.addTask('QA-BENCH-002', { title: '50人基准任务', sourceRef: 'benchmark:unique-task' }).ok, false);
const restoreSource = structuredClone(store.getWorkspace());
assert.equal(store.addTask('QA-BENCH-003', '恢复前变化').ok, true);
assert.equal(store.restoreWorkspace(restoreSource).tasks.some((task) => task.title === '恢复前变化'), false);
assert.equal(store.getRestoreSnapshotSummary().activePatients, restoreSource.patients.length);
assert.equal(store.restorePreviousWorkspace().ok, true);
assert.equal(store.getWorkspace().tasks.some((task) => task.title === '恢复前变化'), true);
assert.equal(store.getWorkspaceIntegrity().ok, true);

console.log('50-patient de-identified benchmark fixture and large-regression gate: passed');
