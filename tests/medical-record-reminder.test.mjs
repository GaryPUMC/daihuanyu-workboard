import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const source = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const REFERENCE_DATE = '2026-09-05';
const sourceWorkspace = {
  schemaVersion: 12,
  settings: { activeDepartment: '整形外科', departments: ['整形外科'] },
  patients: [
    { id: 'MR-001', name: '虚拟患者甲', bed: '12', gender: '男', patientType: '普通', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-08-22', surgeryDate: '2026-08-23', surgeon: '虚拟主刀', allergyStatus: 'none' },
    { id: 'MR-002', name: '虚拟患者乙', bed: '18', gender: '女', patientType: '普通', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-08-29', surgeryDate: '2026-08-30', plannedDischargeDate: '2026-09-06', surgeon: '虚拟主刀', allergyStatus: 'none' },
    { id: 'MR-003', name: '虚拟患者丙', bed: '21', gender: '男', patientType: '国疗', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-09-01', surgeryDate: '2026-09-02', surgeon: '虚拟主刀', allergyStatus: 'unknown' },
    { id: 'MR-004', name: '虚拟患者丁', bed: '25', gender: '女', patientType: '普通', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-08-31', surgeryDate: '2026-09-01', plannedDischargeDate: '2026-09-06', surgeon: '虚拟主刀', allergyStatus: 'none' },
    { id: 'MR-005', name: '虚拟患者戊', bed: '28', gender: '女', patientType: '普通', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-08-29', surgeryDate: '2026-08-30', plannedDischargeDate: '2026-09-03', actualDischargeDate: '2026-09-03', surgeon: '虚拟主刀', allergyStatus: 'none' },
    { id: 'MR-006', name: '虚拟患者己', bed: '30', gender: '男', patientType: '普通', department: '整形外科', admissionState: 'admitted', admissionDate: '2026-09-01', surgeryDate: '', surgeon: '虚拟主刀', allergyStatus: 'none' },
  ],
  archivedPatients: [], rounds: [], tasks: [], taskDrafts: [], stageLogs: [], devices: [], observations: [], clinicalEvents: [], pathologySpecimens: [], revokedRegistrations: [],
};

const migrated = store.prepareBackupImport(sourceWorkspace);
assert.equal(migrated.sourceSchemaVersion, 12);
assert.equal(migrated.targetSchemaVersion, 13);
assert.equal(migrated.workspace.schemaVersion, 13);
assert.deepEqual(migrated.workspace.medicalRecordCompletions, []);
storage.set(store.workspaceStorageKeys().current, structuredClone(sourceWorkspace));
const automaticallyMigrated = store.getWorkspace();
assert.equal(automaticallyMigrated.schemaVersion, 13);
assert.equal(storage.get(store.workspaceStorageKeys().medicalRecordMigrationSnapshot).schemaVersion, 12, '升级前必须保留schema 12本机快照');

function board() {
  return store.getMedicalRecordBoard(REFERENCE_DATE, store.getWorkspace(), '整形外科');
}

function patientRow(patientId) {
  const row = board().patients.find((item) => item.id === patientId);
  assert.ok(row, `未找到病历提醒患者 ${patientId}`);
  return row;
}

function podCell(patientId, pod) {
  const cell = patientRow(patientId).podCells.find((item) => item.pod === pod);
  assert.ok(cell, `未找到 ${patientId} POD${pod}`);
  return cell;
}

function completePod(patientId, pod) {
  const cell = podCell(patientId, pod);
  const result = store.setMedicalRecordRequirementDone(patientId, cell.requirementKey, true, REFERENCE_DATE);
  assert.equal(result.ok, true, `${patientId} POD${pod} 应可标记完成`);
}

// 既有患者先由用户按院内病历逐格核对；纯文字查房不得自动完成正式病历提醒。
for (const pod of [1, 2, 3]) completePod('MR-001', pod);
for (const pod of [1, 2, 3]) completePod('MR-002', pod);
for (const pod of [1, 2]) completePod('MR-003', pod);
for (const pod of [1, 2, 3]) completePod('MR-004', pod);
for (const pod of [1, 2, 3]) completePod('MR-005', pod);
assert.equal(store.saveRound('MR-003', { date: REFERENCE_DATE, content: '脱敏查房文字，不等于正式病历。' }).ok, true);
assert.equal(podCell('MR-003', 3).done, false, '查房记录不得自动完成病历节点');

const initialBoard = board();
assert.deepEqual(initialBoard.podColumns.slice(0, 6), [1, 2, 3, 6, 9, 12]);
assert.equal(initialBoard.podColumns.includes(15), true, '长期在院患者应继续显示 POD12、15 等后续节点');
assert.equal(initialBoard.patients.some((item) => item.id === 'MR-006'), false, '没有手术日期不得生成POD表格');

assert.equal(podCell('MR-001', 6).status, 'severe');
assert.equal(podCell('MR-001', 6).overdueDays, 7);
assert.equal(podCell('MR-001', 9).status, 'overdue');
assert.equal(podCell('MR-001', 12).status, 'warning');
assert.equal(podCell('MR-002', 6).status, 'today');
assert.equal(podCell('MR-003', 3).status, 'today');
assert.equal(podCell('MR-002', 9).status, 'future');
assert.equal(store.setMedicalRecordRequirementDone('MR-002', podCell('MR-002', 9).requirementKey, true, REFERENCE_DATE).ok, false, '未来节点不可提前完成');

// 计划出院前一天或当天为一个窗口；与POD节点重合时只计一项并同步完成。
const combinedDischarge = patientRow('MR-002').dischargeCell;
assert.equal(combinedDischarge.linkedPod, 6);
assert.equal(combinedDischarge.requirementKey, podCell('MR-002', 6).requirementKey);
const pendingBeforeCombined = board().summary.pending;
assert.equal(store.setMedicalRecordRequirementDone('MR-002', combinedDischarge.requirementKey, true, REFERENCE_DATE).ok, true);
assert.equal(podCell('MR-002', 6).done, true);
assert.equal(patientRow('MR-002').dischargeCell.done, true);
assert.equal(board().summary.pending, pendingBeforeCombined - 1, '重合节点不得重复计数');
assert.equal(store.setMedicalRecordRequirementDone('MR-002', combinedDischarge.requirementKey, false, REFERENCE_DATE).ok, true);
assert.equal(podCell('MR-002', 6).done, false, '再次点击应可撤销');

// 无重合POD时，出院窗口是独立可点击节点。
const standaloneDischarge = patientRow('MR-004').dischargeCell;
assert.equal(standaloneDischarge.linkedPod, null);
assert.equal(standaloneDischarge.status, 'window');
assert.equal(store.setMedicalRecordRequirementDone('MR-004', standaloneDischarge.requirementKey, true, REFERENCE_DATE).ok, true);
assert.equal(patientRow('MR-004').dischargeCell.done, true);

// 实际出院后停止产生新POD要求；出院日前已有病历可同时满足出院窗口。
assert.equal(podCell('MR-005', 6).status, 'not-applicable');
assert.equal(patientRow('MR-005').dischargeCell.linkedPod, 3);
assert.equal(patientRow('MR-005').dischargeCell.done, true);

// 撤销、恢复患者登记时，独立的正式病历确认记录必须跟随患者一起迁移。
const revokedPatient = store.revokePatientRegistration('MR-004');
assert.equal(revokedPatient.ok, true, '患者撤销应成功');
const revokedBundle = store.getRevokedRegistrations().find((item) => item.patient.id === 'MR-004');
assert.equal(
  revokedBundle.records.medicalRecordCompletions.some((item) => item.requirementKey === standaloneDischarge.requirementKey),
  true,
  '撤销患者时应一并保存病历完成标记'
);
const restoredPatient = store.restoreRevokedRegistration(revokedBundle.id);
assert.equal(restoredPatient.ok, true, '患者恢复应成功');
assert.equal(store.getWorkspace().medicalRecordCompletions.some((item) => item.patientId === 'MR-004'), true, '恢复患者时应恢复病历完成标记');

// 独立出院确认与POD确认同时存在时，撤销前者后应明确告知仍由POD满足。
assert.equal(store.updatePatient('MR-004', { surgeryDate: '2026-09-02' }).ok, true);
completePod('MR-004', 3);
const dualSatisfiedDischarge = patientRow('MR-004').dischargeCell;
assert.equal(dualSatisfiedDischarge.done, true);
assert.equal(dualSatisfiedDischarge.linkedPod, 3);
const undoExplicitDischarge = store.setMedicalRecordRequirementDone('MR-004', dualSatisfiedDischarge.requirementKey, false, REFERENCE_DATE);
assert.equal(undoExplicitDischarge.ok, true);
assert.equal(undoExplicitDischarge.stillSatisfied, true);
assert.equal(undoExplicitDischarge.remainingLinkedPod, 3);
assert.equal(patientRow('MR-004').dischargeCell.done, true, '撤销单独确认后，POD记录仍应满足出院要求');

// 手术日期更正后必须按新日期重新核对，旧完成标记保留但不得静默挪用。
completePod('MR-003', 3);
const oldRequirementKey = podCell('MR-003', 3).requirementKey;
assert.equal(store.updatePatient('MR-003', { surgeryDate: '2026-09-01' }).ok, true);
const correctedCell = podCell('MR-003', 3);
assert.notEqual(correctedCell.requirementKey, oldRequirementKey);
assert.equal(correctedCell.done, false);
assert.equal(store.getWorkspace().medicalRecordCompletions.some((item) => item.requirementKey === oldRequirementKey), true, '日期更正不得删除旧确认痕迹');
assert.equal(store.updatePatient('MR-003', { id: 'MR-003A' }).ok, true);
assert.equal(store.getWorkspace().medicalRecordCompletions.some((item) => item.patientId === 'MR-003A' && item.requirementKey === oldRequirementKey), true, '更正住院号时必须同步关联完成标记');

assert.equal(store.getWorkspaceIntegrity().ok, true);
assert.equal(store.getBackupSummary(store.getWorkspace()).medicalRecordCompletions > 0, true);

console.log('medical-record reminder schedule, discharge window, direct toggle, and persistence: passed');
