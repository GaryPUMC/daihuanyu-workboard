import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createV3ImportDemo } from './fixtures/v3-import-demo.mjs';

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const source = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sourceWorkspace = createV3ImportDemo();
const imported = store.prepareBackupImport(sourceWorkspace);

assert.equal(imported.sourceSchemaVersion, 3);
assert.equal(imported.targetSchemaVersion, 13);
assert.equal(imported.migrated, true);
assert.equal(imported.workspace.patients.length, 10);
assert.equal(imported.workspace.devices.length, 9);
assert.equal(imported.workspace.observations.length, 3);
assert.equal(imported.workspace.clinicalEvents.length, 11);
assert.equal(imported.workspace.pathologySpecimens.length, 4);
assert.equal(Boolean(imported.workspace.legacyWorkflow), true);
assert.equal('stages' in imported.workspace.settings, false);
assert.equal('departmentWorkflows' in imported.workspace.settings, false);
assert.equal('templates' in imported.workspace, false);
assert.equal(imported.integrity.ok, true);

// 任意旧 stage 都不影响事实状态；只有实际出院日期会改变为“已出院”。
const factualWorkspace = structuredClone(imported.workspace);
const factualPatient = factualWorkspace.patients[0];
factualPatient.stage = '整理';
factualPatient.actualDischargeDate = '';
factualPatient.archived = false;
factualPatient.patientType = '普通';
factualPatient.admissionDate = '2026-08-01';
factualPatient.surgeryDate = '2026-08-02';
storage.set('daihuanyu_workboard_local_v3', factualWorkspace);
assert.equal(store.getPatientStatus(store.getPatient(factualPatient.id), '2026-08-03'), '在院');
assert.equal(store.dischargePatient(factualPatient.id, '2026-08-03').ok, true);
assert.equal(store.getPatientStatus(store.getPatient(factualPatient.id), '2026-08-03'), '已出院');
assert.equal(store.getWorkspace().clinicalEvents.some((event) => event.patientId === factualPatient.id && event.type === 'patient-discharged'), true);
assert.equal(store.getActiveTasks().some((task) => task.patientId === factualPatient.id), false);
assert.equal(store.revertPatientDischarge(factualPatient.id, '').ok, false);
assert.equal(store.revertPatientDischarge(factualPatient.id, '日期录入有误').ok, true);
assert.equal(store.getPatientStatus(store.getPatient(factualPatient.id), '2026-08-03'), '在院');

// 日期校验和日间同日规则继续有效。
const validationBase = { name: '脱敏校验患者', bed: '1', gender: '女', patientType: '普通', department: '整形外科', admissionState: 'admitted', surgeon: '脱敏主刀', allergyStatus: 'unknown' };
assert.match(store.createPatient({ ...validationBase, id: 'validation-1', admissionDate: '2026-08-08', surgeryDate: '2026-08-07' }).error, /手术日期不能早于入院日期/);
assert.match(store.createPatient({ ...validationBase, id: 'validation-day-empty', patientType: '日间', admissionDate: '2026-08-08', surgeryDate: '' }).error, /日间患者必须填写手术日期/);
assert.equal(store.createPatient({ ...validationBase, id: 'validation-day', patientType: '日间', admissionDate: '2026-08-08', surgeryDate: '2026-08-08', plannedDischargeDate: '2026-08-08' }).ok, true);
assert.equal(store.dischargePatient('validation-day', '2026-08-09').error, '日间患者的入院、手术与实际出院日期必须为同一天');

const invalidBackup = structuredClone(sourceWorkspace);
invalidBackup.patients[0].admissionDate = '2026-02-31';
assert.throws(() => store.prepareBackupImport(invalidBackup), /备份中存在无效日期/);
assert.equal(store.prepareBackupImport(invalidBackup, { allowDateWarnings: true }).dateWarning, '入院日期格式无效');

// 病房/床位缺失语义必须准确区分。
const multiWards = { 骨科: ['综合一', '综合二'] };
assert.equal(store.getPatientLocation({ department: '骨科', ward: '综合一', bed: '' }, multiWards), '综合一 · 床位待分配');
assert.equal(store.getPatientLocation({ department: '骨科', ward: '', bed: '12' }, multiWards), '病房待分配 · 12床');
assert.equal(store.getPatientLocation({ department: '骨科', ward: '', bed: '' }, multiWards), '病房及床位待分配');
assert.equal(store.getPatientLocation({ department: '骨科', ward: '综合二', bed: '8' }, multiWards), '综合二 · 8床');
assert.equal(store.getPatientLocation({ department: '普外科', ward: '', bed: '' }, {}), '床位待分配');

assert.deepEqual(store.getDepartmentWards('骨科', store.getWorkspace().settings), ['骨科']);
assert.equal(store.addDepartmentWard('骨科', '综合一').ok, true);
assert.equal(store.addDepartmentWard('骨科', '综合二').ok, true);
assert.deepEqual(store.getDepartmentWards('骨科', store.getWorkspace().settings), ['综合一', '综合二']);
assert.match(store.createPatient({ id: 'ward-missing', name: '脱敏病房患者', patientType: '普通', admissionState: 'admitted', ward: '', bed: '12', gender: '男', department: '骨科', admissionDate: '2026-08-08', surgeon: '脱敏主刀' }).error, /该科室有多个病房，请手动选择病房/);
assert.equal(store.createPatient({ id: 'ward-valid', name: '脱敏病房患者', patientType: '普通', admissionState: 'admitted', ward: '综合一', bed: '12', gender: '男', department: '骨科', admissionDate: '2026-08-08', surgeon: '脱敏主刀' }).ok, true);
assert.equal(store.moveDepartmentWard('骨科', '综合二', 'up'), true);
assert.deepEqual(store.getDepartmentWards('骨科', store.getWorkspace().settings), ['综合二', '综合一']);
assert.equal(store.getPatient('ward-valid').ward, '综合一');
assert.equal(store.moveDepartmentWard('骨科', '综合二', 'up'), false);
assert.equal(store.moveDepartmentWard('骨科', '不存在病房', 'down'), false);

// 科室排序只改变各选择器的显示次序，不改当前科室、患者归属或病房映射。
const beforeDepartmentMove = store.getWorkspace();
const departmentsBeforeMove = [...beforeDepartmentMove.settings.departments];
const activeDepartmentBeforeMove = beforeDepartmentMove.settings.activeDepartment;
const wardsBeforeMove = structuredClone(beforeDepartmentMove.settings.departmentWards);
const movedDepartment = departmentsBeforeMove[1];
assert.equal(store.moveDepartment(movedDepartment, 'up'), true);
assert.deepEqual(store.getWorkspace().settings.departments, [movedDepartment, departmentsBeforeMove[0], ...departmentsBeforeMove.slice(2)]);
assert.equal(store.getWorkspace().settings.activeDepartment, activeDepartmentBeforeMove);
assert.deepEqual(store.getWorkspace().settings.departmentWards, wardsBeforeMove);
assert.equal(store.getPatient('ward-valid').department, '骨科');
assert.equal(store.moveDepartment(movedDepartment, 'up'), false);
assert.equal(store.moveDepartment('不存在科室', 'down'), false);

// 恢复仅含自定义科室的旧数据时，当前科室必须落在有效列表中。
const customDepartmentRestore = store.prepareBackupImport({ schemaVersion: 13, settings: { activeDepartment: '不存在科室', departments: ['胸外科'] }, patients: [] });
assert.equal(customDepartmentRestore.workspace.settings.activeDepartment, '胸外科');

// 旧引流字段和已拔除记录继续兼容，手术日/POD 只作为日期信息。
const legacyDrainWorkspace = {
  schemaVersion: 8,
  settings: { activeDepartment: '整形外科' },
  patients: [{ id: 'LEGACY-TUBE-001', name: '脱敏旧患者', bed: '9', gender: '男', department: '整形外科', admissionDate: '2026-08-01', surgeryDate: '2026-08-02', stage: '入院', legacyDrainPresent: true }],
  archivedPatients: [], rounds: [], tasks: [], taskDrafts: [], templates: [], stageLogs: [], clinicalEvents: [], pathologySpecimens: [], observations: [],
};
const legacyDrain = store.prepareBackupImport(legacyDrainWorkspace);
assert.equal(legacyDrain.workspace.devices.length, 1);
assert.equal(legacyDrain.workspace.devices[0].type, 'drain');
assert.equal(store.getPOD('2026-08-02', '2026-08-03'), 1);

// 恢复前快照、回收站和完整性校验保持可用。
storage.set('daihuanyu_workboard_local_v3', structuredClone(imported.workspace));
const targetId = imported.workspace.patients[1].id;
assert.equal(store.addTask(targetId, { title: '撤销关联任务', priority: '重要' }).ok, true);
assert.equal(store.revokePatientRegistration(targetId).ok, true);
const revoked = store.getRevokedRegistrations().find((entry) => entry.patient.id === targetId);
assert.equal(store.restoreRevokedRegistration(revoked.id).ok, true);
const backup = structuredClone(store.getWorkspace());
assert.equal(store.restoreWorkspace(backup).schemaVersion, 13);
assert.equal(store.getRestoreSnapshotSummary().activePatients, backup.patients.length);
assert.equal(store.restorePreviousWorkspace().ok, true);
assert.equal(store.getWorkspaceIntegrity().ok, true);

console.log('v3 de-identified migration, factual status, location semantics, recovery, and validation: passed');
