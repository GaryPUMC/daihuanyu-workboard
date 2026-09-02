import assert from 'node:assert/strict';
import fs from 'node:fs';

// 六位完全脱敏虚拟患者共同覆盖普通、国疗、日间、预入院、建档/编辑、
// 独立术前核查、查房、引流、出院/撤回/归档、回收站与备份恢复。
const SIX_PATIENTS = [
  ['QA-SIX-001', '普通', '整形外科', '建档编辑与独立术前核查'],
  ['QA-SIX-002', '普通', '普外科', '普通和重要待办无隐藏阻断'],
  ['QA-SIX-003', '国疗', '普外科', '查房与任务幂等'],
  ['QA-SIX-004', '日间', '整形外科', '同日出院与撤回'],
  ['QA-SIX-005', '日间', '普外科', '日期约束'],
  ['QA-SIX-006', '普通', '普外科', '预入院与回收站恢复'],
];

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const source = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const shiftDate = (dateKey, offset) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
};
const TODAY = store.todayKey();
const YESTERDAY = shiftDate(TODAY, -1);
const TOMORROW = shiftDate(TODAY, 1);
const FUTURE = shiftDate(TODAY, 30);

assert.equal(SIX_PATIENTS.length, 6);
assert.deepEqual(SIX_PATIENTS.map(([, type]) => type).sort(), ['国疗', '日间', '日间', '普通', '普通', '普通'].sort());
assert.equal(typeof store.changePatientStage, 'undefined');
assert.equal(typeof store.getPatientReminders, 'undefined');

const admitted = store.createPatientsAtomically([
  { id: 'QA-SIX-001', name: '虚拟患者甲', bed: '101', age: '40', gender: '男', department: '整形外科', patientType: '普通', diagnosis: '脱敏诊断甲', admissionState: 'admitted', admissionDate: YESTERDAY, surgeryDate: TODAY, plannedDischargeDate: TOMORROW, surgeryName: '脱敏术式甲', surgeon: '虚拟主刀', allergyStatus: 'none' },
  { id: 'QA-SIX-002', name: '虚拟患者乙', bed: '102', age: '41', gender: '女', department: '普外科', patientType: '普通', diagnosis: '脱敏诊断乙', admissionState: 'admitted', admissionDate: YESTERDAY, surgeryDate: YESTERDAY, plannedDischargeDate: TODAY, surgeryName: '脱敏术式乙', surgeon: '虚拟主刀', allergyStatus: 'unknown' },
  { id: 'QA-SIX-003', name: '虚拟患者丙', bed: '103', age: '42', gender: '男', department: '普外科', patientType: '国疗', diagnosis: '脱敏诊断丙', admissionState: 'admitted', admissionDate: YESTERDAY, surgeryDate: TODAY, plannedDischargeDate: TOMORROW, surgeryName: '脱敏术式丙', surgeon: '虚拟主刀', firstAssistant: '虚拟一助', allergyStatus: 'none' },
  { id: 'QA-SIX-004', name: '虚拟患者丁', bed: '104', age: '43', gender: '女', department: '整形外科', patientType: '日间', diagnosis: '脱敏诊断丁', admissionState: 'admitted', admissionDate: TODAY, surgeryDate: TODAY, plannedDischargeDate: TODAY, surgeryName: '脱敏术式丁', surgeon: '虚拟主刀', firstAssistant: '虚拟一助', allergyStatus: 'none' },
  { id: 'QA-SIX-005', name: '虚拟患者戊', bed: '105', age: '44', gender: '男', department: '普外科', patientType: '日间', diagnosis: '脱敏诊断戊', admissionState: 'admitted', admissionDate: TODAY, surgeryDate: TODAY, plannedDischargeDate: TODAY, surgeryName: '脱敏术式戊', surgeon: '虚拟主刀', allergyStatus: 'none' },
  { id: 'QA-SIX-006', name: '虚拟患者己', bed: '', age: '45', gender: '女', department: '普外科', patientType: '普通', diagnosis: '脱敏诊断己', admissionState: 'planned', admissionDate: FUTURE, surgeryDate: shiftDate(FUTURE, 1), plannedDischargeDate: shiftDate(FUTURE, 2), surgeryName: '脱敏术式己', surgeon: '虚拟主刀', allergyStatus: 'none' },
]);
assert.equal(admitted.ok, true);
assert.equal(store.getWorkspace().tasks.length, 0, '建档不得自动生成阶段任务');
assert.equal(store.getWorkspaceIntegrity().ok, true);
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-001')), '在院');
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-006')), '待入院');

// 独立术前核查和正式术式确认只留痕，不改变事实状态或生成待办。
assert.equal(store.confirmSurgeryName('QA-SIX-001', '脱敏正式术式甲').ok, true);
assert.equal(store.setPreopCheck('QA-SIX-001', 'consentSigned', true).ok, true);
assert.equal(store.setPreopCheck('QA-SIX-001', 'testsReviewed', true).ok, true);
assert.equal(store.getPatient('QA-SIX-001').preopChecks.surgeryNameConfirmed.length > 0, true);
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-001')), '在院');
assert.equal(store.getPatientTasks('QA-SIX-001').length, 0);
assert.equal(store.updatePatient('QA-SIX-001', { firstAssistant: '虚拟一助', bed: '111' }).ok, true);
assert.equal(store.getPatient('QA-SIX-001').bed, '111');

// 普通/重要待办均为普通工作项，不参与任何患者状态或出院阻断。
const normalTask = store.addTask('QA-SIX-002', { title: '普通脱敏待办', priority: '普通', sourceRef: 'qa:normal' });
const importantTask = store.addTask('QA-SIX-002', { title: '重要脱敏待办', priority: '重要', sourceRef: 'qa:important' });
assert.equal(normalTask.ok && importantTask.ok, true);
assert.deepEqual(store.getPatientTasks('QA-SIX-002', false).map((task) => task.priority).sort(), ['普通', '重要'].sort());
assert.equal(store.dischargePatient('QA-SIX-002', TODAY).ok, true, '未完成重要待办不得隐藏阻断出院');
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-002')), '已出院');
assert.equal(store.getActiveTasks().some((task) => task.patientId === 'QA-SIX-002'), false);
assert.equal(store.archivePatient('QA-SIX-002').error, '请先通知一助老师并标记“已通知一助”');
assert.equal(store.addClinicalEvent('QA-SIX-002', 'cooperation-discharge-notice', '已通知虚拟一助').ok, true);
assert.equal(store.archivePatient('QA-SIX-002').ok, true);

// 国疗患者覆盖任务幂等与不限长度的纯文字查房。
assert.equal(store.addTask('QA-SIX-003', { title: '国疗脱敏待办', sourceRef: 'qa:national:unique' }).ok, true);
assert.equal(store.addTask('QA-SIX-003', { title: '国疗脱敏待办', sourceRef: 'qa:national:unique' }).ok, false);
const LONG_ROUND_TEXT = `脱敏自由文字查房\n${'不限长度内容。'.repeat(1000)}`;
assert.equal(store.saveRound('QA-SIX-003', { date: TODAY, content: LONG_ROUND_TEXT }).ok, true);
assert.equal(store.saveRound('QA-SIX-003', { date: TODAY, content: `${LONG_ROUND_TEXT}\n更正记录` }).ok, true);
assert.equal(store.getPatientRounds('QA-SIX-003').length, 1);
assert.equal(store.getPatientRounds('QA-SIX-003')[0].content, `${LONG_ROUND_TEXT}\n更正记录`);
assert.equal('assessment' in store.getPatientRounds('QA-SIX-003')[0], false);
assert.equal(store.saveRound('QA-SIX-003', { date: TOMORROW, content: '   ' }).error, '查房文字不能为空');
const currentWithLegacyRound = structuredClone(store.getWorkspace());
currentWithLegacyRound.rounds.push({ id: 'old-round-at-current-schema', patientId: 'QA-SIX-003', date: YESTERDAY, assessment: '应删除的旧结构化记录' });
storage.set(store.workspaceStorageKeys().current, currentWithLegacyRound);
assert.equal(store.getWorkspace().rounds.some((round) => round.id === 'old-round-at-current-schema'), false);
assert.equal(storage.get(store.workspaceStorageKeys().current).rounds.some((round) => round.id === 'old-round-at-current-schema'), false, '旧结构化记录应从当前本地存储中持久删除');

// 手术日由日期决定引流可用性，不依赖旧 stage。
assert.equal(store.addDrain('QA-SIX-001', '脱敏引流管').ok, true);
const drain = store.getWorkspace().devices.find((item) => item.patientId === 'QA-SIX-001');
assert.equal(store.ensureDrainRowCount('QA-SIX-001', 2).ok, true);
assert.equal(store.recordDrainVolume('QA-SIX-001', drain.id, '36.5', 1).ok, true);
assert.equal(store.recordDrainVolume('QA-SIX-001', drain.id, '拔', 2).ok, true);
assert.equal(store.recordDrainVolume('QA-SIX-001', drain.id, '8', 3).ok, false);

// 日间患者同日出院，可有理由撤回并重新确认；旧 stage 不参与结果。
assert.equal(store.dischargePatient('QA-SIX-004', TOMORROW).ok, false);
assert.equal(store.dischargePatient('QA-SIX-004', TODAY).ok, true);
assert.equal(store.revertPatientDischarge('QA-SIX-004', '').ok, false);
assert.equal(store.revertPatientDischarge('QA-SIX-004', '误点确认').ok, true);
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-004')), '在院');
assert.equal(store.dischargePatient('QA-SIX-004', TODAY).ok, true);
assert.match(store.updatePatient('QA-SIX-005', { surgeryDate: TOMORROW, plannedDischargeDate: TOMORROW }).error, /日间患者的入院与手术日期必须同日/);

// 预入院患者可撤销建档并完整恢复关联记录。
assert.equal(store.addTask('QA-SIX-006', { title: '预入院关联待办', priority: '重要' }).ok, true);
assert.equal(store.revokePatientRegistration('QA-SIX-006').ok, true);
const revoked = store.getRevokedRegistrations().find((entry) => entry.patient.id === 'QA-SIX-006');
assert.equal(revoked.records.tasks.some((task) => task.title === '预入院关联待办'), true);
assert.equal(store.restoreRevokedRegistration(revoked.id).ok, true);
assert.equal(store.getPatientStatus(store.getPatient('QA-SIX-006')), '待入院');

// v9 旧备份迁移：历史配置/日志进入兼容层；系统任务退休；自定义路径待办安全转普通待办。
const legacy = {
  schemaVersion: 9,
  settings: {
    activeDepartment: '整形外科', departments: ['整形外科'], procedures: ['未选择术式'], taskCategories: ['其他'], conditionTags: [], firstAssistants: [],
    stages: ['术前', '手术'], stageRequirements: { 术前: ['系统阶段项'] }, departmentWorkflows: { 整形外科: [{ name: '术前', criticalTasks: ['系统阶段项'] }] }, departmentTemplates: { 整形外科: 'custom-template' }, procedureTemplates: {},
  },
  patients: [{ id: 'LEGACY-001', name: '旧虚拟患者', bed: '9', gender: '男', department: '整形外科', admissionDate: YESTERDAY, surgeryDate: TODAY, stage: '术前' }],
  archivedPatients: [], rounds: [{ id: 'legacy-structured-round', patientId: 'LEGACY-001', date: TODAY, symptoms: '旧主诉', exam: '旧查体', assessment: '旧评估', plan: '旧计划' }], taskDrafts: [], devices: [], observations: [], clinicalEvents: [], pathologySpecimens: [], revokedRegistrations: [],
  templates: [{ id: 'custom-template', name: '旧自定义路径', rules: [{ id: 'custom-rule', tasks: ['用户自定义路径项'] }] }],
  stageLogs: [{ id: 'legacy-log', patientId: 'LEGACY-001', fromStage: '入院', toStage: '术前', action: 'advance', at: new Date().toISOString() }],
  tasks: [
    { id: 'legacy-stage-todo', patientId: 'LEGACY-001', title: '系统阶段项', status: 'todo', source: '阶段要求', sourceRef: 'stage:术前:系统阶段项', stage: '术前', critical: true },
    { id: 'legacy-path-todo', patientId: 'LEGACY-001', title: '用户自定义路径项', status: 'todo', source: '路径建议', sourceRef: 'rule:custom-rule:2026-01-01:0', stage: '术前', critical: true, priority: '重要', effect: { key: 'drainRemoved', value: true } },
    { id: 'legacy-path-orphan', patientId: 'LEGACY-001', title: '模板已丢失的用户路径项', status: 'todo', source: '路径建议', sourceRef: 'rule:missing-custom-rule:2026-01-01:0', stage: '术前', critical: true },
    { id: 'legacy-path-system', patientId: 'LEGACY-001', title: '内置路径项', status: 'todo', source: '路径建议', sourceRef: 'rule:rule-pod-1:2026-01-01:0', stage: '术后', critical: false },
    { id: 'legacy-stage-done', patientId: 'LEGACY-001', title: '核查手术同意书等已签署', status: 'done', source: '阶段要求', sourceRef: 'stage:术前:核查手术同意书等已签署', stage: '术前', critical: true, completedAt: new Date().toISOString() },
  ],
};
const migrated = store.prepareBackupImport(legacy);
assert.equal(migrated.targetSchemaVersion, 11);
assert.equal(Boolean(migrated.workspace.legacyWorkflow), true);
assert.deepEqual(migrated.workspace.legacyWorkflow.stages, ['术前', '手术']);
assert.equal('departmentWorkflows' in migrated.workspace.settings, false);
assert.equal(migrated.workspace.stageLogs.length, 1, '历史流程日志只在数据层保留');
assert.equal(migrated.workspace.rounds.length, 0, '旧结构化查房记录按要求直接删除');
const retired = migrated.workspace.tasks.find((task) => task.id === 'legacy-stage-todo');
const customPath = migrated.workspace.tasks.find((task) => task.id === 'legacy-path-todo');
const orphanCustomPath = migrated.workspace.tasks.find((task) => task.id === 'legacy-path-orphan');
assert.equal(retired.source, '已退休的系统流程任务');
assert.equal(retired.critical, false);
assert.equal(customPath.source, '旧路径转普通待办');
assert.equal(customPath.critical, false);
assert.equal(customPath.stage, '');
assert.equal(customPath.priority, '普通');
assert.equal(customPath.effect, null, '旧路径待办不得保留隐藏副作用');
assert.equal(orphanCustomPath.source, '旧路径转普通待办', '模板缺失的旧路径待办也不得遗失');
storage.set('daihuanyu_workboard_local_v3', structuredClone(migrated.workspace));
assert.deepEqual(store.getActiveTasks().map((task) => task.id).sort(), ['legacy-path-orphan', 'legacy-path-todo']);
assert.deepEqual(store.getPatientTasks('LEGACY-001').map((task) => task.id).sort(), ['legacy-path-orphan', 'legacy-path-todo']);
assert.equal('stageLogs' in store.getPatientBundle('LEGACY-001'), false);
assert.equal(Boolean(store.getPatient('LEGACY-001').preopChecks.consentSigned), true, '已完成术前核查记录应迁移保留');

// 备份恢复与恢复前快照保持关联完整。
const backup = structuredClone(store.getWorkspace());
assert.equal(store.prepareBackupImport(backup).integrity.ok, true);
assert.equal(store.addTask('LEGACY-001', { title: '恢复前快照标记', sourceRef: 'qa:snapshot' }).ok, true);
assert.equal(store.restoreWorkspace(backup).tasks.some((task) => task.title === '恢复前快照标记'), false);
assert.equal(store.restorePreviousWorkspace().ok, true);
assert.equal(store.getWorkspace().tasks.some((task) => task.title === '恢复前快照标记'), true);
assert.equal(store.getWorkspaceIntegrity().ok, true);

console.log('six-patient factual-state, workflow-retirement, recovery, and safety gate: passed');
