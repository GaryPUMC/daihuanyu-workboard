
import { patientDraftErrorText, validatePatientDraft } from './patient-draft';

const LEGACY_STORAGE_KEY = 'daihuanyu_workboard_local_v1';
const PREVIOUS_STORAGE_KEY = 'daihuanyu_workboard_local_v2';
const STORAGE_KEY = 'daihuanyu_workboard_local_v3';
const MIGRATION_SNAPSHOT_KEY = 'daihuanyu_workboard_migration_snapshot_v2';
const RESTORE_SNAPSHOT_KEY = 'daihuanyu_workboard_restore_snapshot_v3';
const SIMULATION_CLEANUP_SNAPSHOT_KEY = 'daihuanyu_workboard_simulation_cleanup_snapshot_v1';
const V4_MIGRATION_SNAPSHOT_KEY = 'daihuanyu_workboard_migration_snapshot_v4';
const PREOP_MIGRATION_SNAPSHOT_KEY = 'daihuanyu_workboard_preop_migration_snapshot_v12';
const MEDICAL_RECORD_MIGRATION_SNAPSHOT_KEY = 'daihuanyu_workboard_medical_record_migration_snapshot_v13';
const SCHEMA_VERSION = 13;
const PATIENT_RECORD_KEYS = ['rounds', 'tasks', 'taskDrafts', 'stageLogs', 'devices', 'observations', 'clinicalEvents', 'pathologySpecimens', 'medicalRecordCompletions'];

export const PLASTIC_PATIENT_TYPES = ['普通', '国疗', '日间'];
export const ALLERGY_STATUS_OPTIONS = ['unknown', 'none', 'present'];
const PLASTIC_SURGERY_NAME_CONFIRM_TASK = '与主刀确认手术名称，并核实手术同意书名称';
const PLASTIC_CONSENT_TASK = '核查手术同意书等已签署';

const LEGACY_PREOP_CHECK_KEYS = {
  [PLASTIC_SURGERY_NAME_CONFIRM_TASK]: 'surgeryNameConfirmed',
  [PLASTIC_CONSENT_TASK]: 'consentSigned',
  '核查术前检查已完善并打印化验单': 'testsReviewed',
  '核查入院病史已签字': 'historySigned',
  '完成术前拍照': 'photosCompleted',
};
const LEGACY_PREOP_CHECK_TITLES = {
  surgeryNameConfirmed: '与主刀确认正式术式',
  consentSigned: '核查手术同意书等已签署',
  testsReviewed: '核查术前检查已完善并打印化验单',
  historySigned: '核查入院病史已签字',
  photosCompleted: '完成术前拍照',
};
const BUILTIN_PATH_RULE_IDS = new Set(['rule-preop-1', 'rule-pod-0', 'rule-pod-1', 'rule-discharge']);
const RETIRED_WORKFLOW_TASK_SOURCE = '已退休的系统流程任务';
const MIGRATED_CUSTOM_PATH_SOURCE = '旧路径转普通待办';

const DEFAULT_ROUND_ACTIONS = [
  { id: 'round-action-dressing', title: '换药', category: '查房', priority: '普通', effect: null },
  { id: 'round-action-blood-test', title: '复查血常规', category: '检查', priority: '普通', effect: null },
  { id: 'round-action-drain', title: '记录引流量', category: '术后观察', priority: '重要', postoperativeOnly: true, effect: null },
];

const DEFAULT_SETTINGS = {
  activeDepartment: '整形外科',
  departments: ['轮转通用', '整形外科', '普外科', '骨科', '泌尿外科', '妇产科', '神经外科'],
  archivedDepartments: [],
  // Omit a department here to use its single, hidden default ward. Add two or
  // more wards in Settings to enable an explicit ward selector for that department.
  departmentWards: {},
  procedures: ['未选择术式'],
  diagnoses: [],
  taskCategories: ['查房', '检查', '沟通签字', '术前准备', '术后观察', '出院整理', '其他'],
  conditionTags: ['有引流', '留置导尿', '抗凝中'],
  firstAssistants: ['张明子', '张文超', '李硕', '常国婧'],
  roundActionTemplates: DEFAULT_ROUND_ACTIONS,
  // 脱敏默认关闭：用户可在任一页面切换，所有页面读取同一份本地偏好。
  privacyMaskEnabled: false,
  clinicalPresetVersion: 5,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// All calendar fields in this app use Beijing time (UTC+8), irrespective of device timezone.
export function todayKey(date = new Date()) {
  const beijing = new Date(date.getTime() + 8 * 60 * 60000);
  const year = beijing.getUTCFullYear();
  const month = `${beijing.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${beijing.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBeijingDateTime(value, withSeconds = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const beijing = new Date(date.getTime() + 8 * 60 * 60000);
  const year = beijing.getUTCFullYear();
  const month = `${beijing.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${beijing.getUTCDate()}`.padStart(2, '0');
  const hour = `${beijing.getUTCHours()}`.padStart(2, '0');
  const minute = `${beijing.getUTCMinutes()}`.padStart(2, '0');
  const second = `${beijing.getUTCSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}${withSeconds ? `:${second}` : ''}`;
}

function localDate(dateString) {
  if (!dateString) return null;
  const parts = `${dateString}`.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dayDifference(later, earlier) {
  const one = localDate(later);
  const two = localDate(earlier);
  if (!one || !two) return null;
  return Math.round((one.getTime() - two.getTime()) / 86400000);
}

function validDateKey(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function hasActualDischarge(patient) {
  return Boolean(patient && (patient.actualDischargeDate || patient.archived));
}

function validatePatientDates(patient, { enforceDaySurgerySameDay = true } = {}) {
  const fields = [['admissionDate', '入院日期'], ['surgeryDate', '手术日期'], ['plannedDischargeDate', '计划出院日期'], ['actualDischargeDate', '实际出院日期']];
  const invalid = fields.find(([key]) => !validDateKey(`${patient[key] || ''}`));
  if (invalid) return `${invalid[1]}格式无效`;
  const admission = patient.admissionDate || '';
  const surgery = patient.surgeryDate || '';
  const plannedDischarge = patient.plannedDischargeDate || '';
  const actualDischarge = patient.actualDischargeDate || '';
  if (admission && surgery && admission > surgery) return '入院日期不能晚于手术日期';
  if (surgery && plannedDischarge && surgery > plannedDischarge) return '手术日期不能晚于计划出院日期';
  if (!surgery && admission && plannedDischarge && admission > plannedDischarge) return '入院日期不能晚于计划出院日期';
  if (surgery && actualDischarge && surgery > actualDischarge) return '手术日期不能晚于实际出院日期';
  if (!surgery && admission && actualDischarge && admission > actualDischarge) return '入院日期不能晚于实际出院日期';
  if (actualDischarge && actualDischarge > todayKey()) return '实际出院日期不能晚于今天';
  if (enforceDaySurgerySameDay && patient.patientType === '日间') {
    if (!admission || !surgery) return '日间患者请填写入院和手术日期';
    if (admission && surgery && admission !== surgery) return '日间手术患者的入院日期与手术日期必须为同一天';
    if (!plannedDischarge) return '日间患者请填写计划出院日期';
    if (plannedDischarge && admission !== plannedDischarge) return '日间患者的计划出院日期必须与入院日期同一天';
    if (actualDischarge && (!admission || !surgery || admission !== actualDischarge || surgery !== actualDischarge)) return '日间患者的入院、手术与实际出院日期必须为同一天';
  }
  return '';
}

function validatePatientClinicalFields(patient) {
  if (patient.allergyStatus === 'present' && !`${patient.allergies || ''}`.trim()) return '请填写过敏史详情，或改为“无／未核实”';
  return '';
}

export function getDepartmentWards(department, settings = {}) {
  const name = `${department || ''}`.trim();
  const mapping = settings.departmentWards && typeof settings.departmentWards === 'object' ? settings.departmentWards : settings;
  const configured = mapping && Array.isArray(mapping[name]) ? Array.from(new Set(mapping[name].map((ward) => `${ward || ''}`.trim()).filter(Boolean))) : [];
  return configured.length ? configured : (name ? [name] : []);
}

function validatePatientWard(patient, settings) {
  const wards = getDepartmentWards(patient.department, settings);
  const ward = `${patient.ward || ''}`.trim();
  if (wards.length > 1 && !ward) return '该科室有多个病房，请选择病房';
  if (ward && !wards.includes(ward)) return `病房“${ward}”不在${patient.department || '当前科室'}的设置中`;
  return '';
}

function validateWorkspacePatientDates(workspace) {
  const options = { enforceDaySurgerySameDay: false };
  const invalid = [...(workspace.patients || []), ...(workspace.archivedPatients || [])].find((patient) => validatePatientDates(patient, options));
  return invalid ? validatePatientDates(invalid, options) : '';
}

function emptyWorkspace() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: clone(DEFAULT_SETTINGS),
    patients: [],
    archivedPatients: [],
    rounds: [],
    tasks: [],
    taskDrafts: [],
    stageLogs: [],
    devices: [],
    observations: [],
    clinicalEvents: [],
    pathologySpecimens: [],
    medicalRecordCompletions: [],
    revokedRegistrations: [],
    legacyWorkflow: null,
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };
}

function inferGender(patient) {
  if (patient.gender) return patient.gender;
  if (/(F|女)\s*$/i.test(patient.ageSex || '')) return '女';
  if (/(M|男)\s*$/i.test(patient.ageSex || '')) return '男';
  return '';
}

function inferAge(patient) {
  if (patient.age !== undefined && patient.age !== null) return (`${patient.age}`.match(/\d+/) || [''])[0];
  const match = `${patient.ageSex || ''}`.match(/\d+/);
  return match ? match[0] : '';
}

export function formatAgeSex(age, gender) {
  const sex = gender === '女' ? 'F' : gender === '男' ? 'M' : '';
  return [age ? `${age}岁` : '', sex].filter(Boolean).join(' / ');
}

function numericOnly(value) {
  const match = `${value || ''}`.match(/\d+/);
  return match ? match[0] : '';
}

function normalizePatient(patient, archived = false, fallbackDepartment = '轮转通用') {
  const gender = inferGender(patient);
  const age = inferAge(patient);
  const legacyConditions = Array.isArray(patient.conditions) ? patient.conditions : [];
  const existingPostop = patient.postopStatus || {};
  const existingIntraop = patient.intraopStatus || {};
  const department = patient.department || fallbackDepartment;
  const rawStage = patient.stage || '';
  const wasDischarged = archived || Boolean(patient.archived) || ['出院', '整理'].includes(rawStage);
  const legacyDischargeDate = patient.dischargeDate || '';
  const patientType = PLASTIC_PATIENT_TYPES.includes(patient.patientType) ? patient.patientType : '';
  const allergyStatus = ALLERGY_STATUS_OPTIONS.includes(patient.allergyStatus) ? patient.allergyStatus : (patient.allergies || patient.allergyHistory ? 'present' : 'unknown');
  const sourceChecks = patient.preopChecks && typeof patient.preopChecks === 'object' ? patient.preopChecks : {};
  const confirmedSurgeryName = `${patient.confirmedSurgeryName || ''}`.trim();
  const sourceConfirmationAt = patient.surgeryNameConfirmedAt || sourceChecks.surgeryNameConfirmed || '';
  const surgeryNameConfirmedAt = confirmedSurgeryName && sourceConfirmationAt ? sourceConfirmationAt : '';
  const explicitAdmissionState = ['planned', 'admitted'].includes(patient.admissionState) ? patient.admissionState : '';
  // schema 10 及更早版本没有显式入院状态。迁移时保持原有日期语义，
  // 对缺少日期或床位的记录额外标记待核实，不静默补造事实。
  const legacyAdmissionState = wasDischarged || patient.actualDischargeDate
    ? 'admitted'
    : (patient.admissionDate && validDateKey(`${patient.admissionDate}`) && patient.admissionDate > todayKey() ? 'planned' : 'admitted');
  const admissionState = explicitAdmissionState || legacyAdmissionState;
  const admissionStateNeedsReview = Boolean(patient.admissionStateNeedsReview || (!explicitAdmissionState && (!patient.admissionDate || (admissionState === 'admitted' && !numericOnly(patient.bed)))));
  return {
    id: `${patient.id || patient.hospitalId || uniqueId('patient')}`,
    name: patient.name || '',
    bed: numericOnly(patient.bed),
    age,
    gender,
    ageSex: formatAgeSex(age, gender),
    department,
    ward: `${patient.ward || ''}`.trim(),
    patientType,
    diagnosis: patient.diagnosis || '',
    admissionState,
    admissionStateNeedsReview,
    admissionDate: patient.admissionDate || '',
    surgeryDate: patient.surgeryDate || '',
    // v7 and earlier used dischargeDate for both a plan and a completed discharge.
    // Keep that data without guessing: completed records become actual, all others planned.
    plannedDischargeDate: patient.plannedDischargeDate || (!wasDischarged ? legacyDischargeDate : ''),
    actualDischargeDate: patient.actualDischargeDate || (wasDischarged ? legacyDischargeDate : ''),
    allergyStatus,
    allergies: allergyStatus === 'none' ? '' : patient.allergies || patient.allergyHistory || '',
    surgeryName: patient.surgeryName || patient.procedure || '',
    confirmedSurgeryName,
    surgeryNameConfirmedAt,
    surgeon: patient.surgeon || '',
    firstAssistant: patient.firstAssistant || '',
    templateId: patient.templateId || '',
    stage: rawStage,
    conditions: legacyConditions.filter((item) => !['有引流', '留置导尿'].includes(item)),
    legacyDrainPresent: Boolean(patient.legacyDrainPresent || legacyConditions.includes('有引流')),
    postopStatus: {
      urinaryCatheter: existingPostop.urinaryCatheter || (legacyConditions.includes('留置导尿') ? 'present' : 'unknown'),
      monitoring: existingPostop.monitoring || 'unknown',
      oxygen: existingPostop.oxygen || 'unknown',
      antibiotic: existingPostop.antibiotic || 'unknown',
    },
    intraopStatus: {
      assistant: existingIntraop.assistant || 'unknown',
      drain: existingIntraop.drain || 'unknown',
      urinaryCatheter: existingIntraop.urinaryCatheter || 'unknown',
      pathology: existingIntraop.pathology || 'unknown',
    },
    workflowOverride: Array.isArray(patient.workflowOverride) ? patient.workflowOverride : [],
    drainRowCount: Math.max(0, Number(patient.drainRowCount) || 0),
    archived: archived || Boolean(patient.archived),
    archivedAt: patient.archivedAt || '',
    createdAt: patient.createdAt || new Date().toISOString(),
    updatedAt: patient.updatedAt || new Date().toISOString(),
  };
}

function normalizeTask(task, patientId) {
  const dueAt = task.dueAt || (task.due && /^\d{4}-\d{2}-\d{2}/.test(task.due) ? task.due : todayKey());
  return {
    id: task.id || uniqueId('task'), patientId, title: task.title || '',
    category: task.category || '其他', priority: task.priority || '普通', dueAt,
    status: task.status || (task.done ? 'done' : 'todo'), source: task.source || '手动添加',
    sourceRef: task.sourceRef || '', stage: task.stage || '', critical: Boolean(task.critical), effect: task.effect || null,
    completionNote: task.completionNote || '', createdAt: task.createdAt || new Date().toISOString(),
    completedAt: task.completedAt || '',
  };
}

function normalizeRound(round, patientId) {
  return {
    id: round.id || uniqueId('round'), patientId, date: round.date || todayKey(),
    content: typeof round.content === 'string' ? round.content : '',
    createdAt: round.createdAt || new Date().toISOString(), updatedAt: round.updatedAt || round.createdAt || new Date().toISOString(),
  };
}

function normalizeMedicalRecordCompletion(completion, patientId) {
  const pod = completion.pod === null || completion.pod === undefined || completion.pod === '' ? null : Number(completion.pod);
  return {
    id: completion.id || uniqueId('medical-record'), patientId: patientId || completion.patientId || '',
    requirementKey: `${completion.requirementKey || ''}`,
    kind: completion.kind === 'discharge' ? 'discharge' : 'pod',
    pod: Number.isFinite(pod) ? pod : null,
    dueDate: `${completion.dueDate || ''}`.slice(0, 10),
    surgeryDate: `${completion.surgeryDate || ''}`.slice(0, 10),
    dischargeDate: `${completion.dischargeDate || ''}`.slice(0, 10),
    completedAt: completion.completedAt || new Date().toISOString(),
  };
}

function normalizeMedicalRecordCompletions(completions, patientId = '') {
  const result = [];
  const seen = new Set();
  (completions || []).map((item) => normalizeMedicalRecordCompletion(item, patientId || item.patientId))
    .filter((item) => item.patientId && item.requirementKey && item.dueDate && validDateKey(item.dueDate))
    .sort((a, b) => `${b.completedAt}`.localeCompare(`${a.completedAt}`))
    .forEach((item) => {
      const key = `${item.patientId}|${item.requirementKey}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
  return result;
}

function normalizePlainTextRounds(rounds, patientId) {
  return (rounds || []).map((item) => normalizeRound(item, patientId || item.patientId))
    .filter((item) => item.content.trim());
}

function hasLegacyStructuredRounds(workspace) {
  if ((workspace.rounds || []).some((item) => typeof item.content !== 'string' || !item.content.trim())) return true;
  return (workspace.revokedRegistrations || []).some((entry) => ((entry.records && entry.records.rounds) || [])
    .some((item) => typeof item.content !== 'string' || !item.content.trim()));
}

function normalizeSettings(settings = {}) {
  const result = { ...clone(DEFAULT_SETTINGS), ...clone(settings) };
  ['departments', 'procedures', 'diagnoses', 'taskCategories', 'conditionTags', 'firstAssistants'].forEach((key) => {
    result[key] = Array.isArray(result[key]) ? Array.from(new Set(result[key].filter(Boolean))) : clone(DEFAULT_SETTINGS[key]);
  });
  if (!result.departments.length) result.departments = clone(DEFAULT_SETTINGS.departments);
  result.archivedDepartments = Array.isArray(result.archivedDepartments)
    ? Array.from(new Set(result.archivedDepartments.map((item) => `${item || ''}`.trim()).filter(Boolean))).filter((item) => !result.departments.includes(item))
    : [];
  if (!result.procedures.includes('未选择术式')) result.procedures.unshift('未选择术式');
  if (!result.departments.includes(result.activeDepartment)) result.activeDepartment = result.departments.includes(DEFAULT_SETTINGS.activeDepartment) ? DEFAULT_SETTINGS.activeDepartment : result.departments[0];
  const sourceWards = settings.departmentWards && typeof settings.departmentWards === 'object' && !Array.isArray(settings.departmentWards) ? settings.departmentWards : {};
  result.departmentWards = Object.fromEntries(Object.entries(sourceWards)
    .filter(([department]) => result.departments.includes(department) || result.archivedDepartments.includes(department))
    .map(([department, wards]) => [department, Array.from(new Set((Array.isArray(wards) ? wards : []).map((ward) => `${ward || ''}`.trim()).filter(Boolean)))])
    .filter(([, wards]) => wards.length));
  ['stages', 'departmentWorkflows', 'departmentTemplates', 'procedureTemplates', 'stageRequirements'].forEach((key) => { delete result[key]; });
  result.clinicalPresetVersion = 5;
  result.roundActionTemplates = (settings.roundActionTemplates || DEFAULT_ROUND_ACTIONS).map((item, index) => {
    if (typeof item === 'string') return { id: `round-action-custom-${index}`, title: item, category: '查房', priority: '普通', postoperativeOnly: false, effect: null };
    const preset = DEFAULT_ROUND_ACTIONS.find((candidate) => candidate.id === item.id) || {};
    return {
      id: item.id || uniqueId('round-action'), title: item.title || preset.title || '', category: item.category || preset.category || '查房',
      priority: item.priority || preset.priority || '普通',
      postoperativeOnly: item.postoperativeOnly === undefined ? Boolean(preset.postoperativeOnly) : Boolean(item.postoperativeOnly),
      effect: item.effect || preset.effect || null,
    };
  }).filter((item) => item.title && !['round-action-stop-monitor', 'round-action-stop-oxygen', 'round-action-remove-catheter'].includes(item.id) && !['停监护', '停吸氧', '拔尿管'].includes(item.title));
  return result;
}

function normalizeDevice(device, legacy = false) {
  const rawType = `${device.type || device.deviceType || 'drain'}`.trim();
  const type = /drain|引流/i.test(rawType) ? 'drain' : rawType;
  const rawStatus = `${device.status || device.state || ''}`.trim();
  const status = type === 'drain' && /removed|inactive|拔|撤|停用/i.test(rawStatus) ? 'removed' : 'active';
  return {
    id: device.id || device.drainId || uniqueId('device'), patientId: `${device.patientId || device.patient || ''}`,
    type, name: device.name || device.title || '引流', status,
    placedAt: device.placedAt || device.createdAt || new Date().toISOString(), removedAt: device.removedAt || device.removalAt || '',
    legacy: Boolean(device.legacy || legacy),
  };
}

function normalizeObservation(observation, patient) {
  const rawPod = Number(observation.pod ?? observation.postopDay ?? observation.postoperativeDay);
  const recordedAt = observation.recordedAt || observation.createdAt || observation.at || new Date().toISOString();
  const derivedPod = patient && patient.surgeryDate && recordedAt
    ? dayDifference(`${recordedAt}`.slice(0, 10), patient.surgeryDate)
    : null;
  const pod = Number.isInteger(rawPod) && rawPod >= 1 ? rawPod : Math.max(1, Number.isInteger(derivedPod) ? derivedPod : 1);
  const entryType = observation.entryType === 'removed' || /removed|拔/i.test(`${observation.type || ''}`) ? 'removed' : 'volume';
  const rawValue = observation.value ?? observation.volume ?? observation.amount;
  return {
    id: observation.id || uniqueId('observation'), patientId: `${observation.patientId || observation.patient || ''}`,
    deviceId: observation.deviceId || observation.drainId || observation.device || '',
    type: observation.type || 'drainVolume', entryType, pod,
    value: entryType === 'removed' ? null : Number(rawValue), unit: observation.unit || 'mL',
    recordedAt,
  };
}

function normalizeClinicalEvent(event) {
  return {
    id: event.id || uniqueId('clinical-event'), patientId: event.patientId, type: event.type || '',
    value: event.value || '', note: event.note || '', at: event.at || new Date().toISOString(),
  };
}

function validEventTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function legacyEventTime(value, patient) {
  const candidates = [value, patient && patient.updatedAt, patient && patient.createdAt];
  return candidates.find((candidate) => candidate && validEventTime(candidate)) || '1970-01-01T00:00:00.000Z';
}

function appendMigratedPreopEvent(events, patient, key, value) {
  if (!patient || !patient.id || !value || !LEGACY_PREOP_CHECK_TITLES[key]) return false;
  const confirmedName = `${patient.confirmedSurgeryName || ''}`.trim();
  let type = 'legacy-preop-check';
  let eventValue = key;
  let note = `旧版记录：${LEGACY_PREOP_CHECK_TITLES[key]}`;
  if (key === 'surgeryNameConfirmed' && confirmedName) {
    type = 'surgery-name-confirmed';
    eventValue = confirmedName;
    note = '由旧版正式术式确认记录迁移';
  } else if (key === 'photosCompleted') {
    type = 'cooperation-photo';
    eventValue = '旧版术前拍照记录已迁移';
    note = '由旧版“完成术前拍照”记录迁移';
  }
  const duplicate = events.some((event) => event.patientId === patient.id && event.type === type
    && (type !== 'legacy-preop-check' || event.value === key));
  if (duplicate) return false;
  events.push(normalizeClinicalEvent({
    id: `migration-preop-v12-${key}-${patient.id}`,
    patientId: patient.id, type, value: eventValue, note, at: legacyEventTime(value, patient),
  }));
  return true;
}

function migratePatientPreopRecord(events, patient, tasks = []) {
  if (!patient || !patient.id) return { patientCount: 0, eventCount: 0 };
  const sourceChecks = patient.preopChecks && typeof patient.preopChecks === 'object' ? patient.preopChecks : {};
  const values = Object.fromEntries(Object.keys(LEGACY_PREOP_CHECK_TITLES).map((key) => [key, sourceChecks[key] || '']));
  if (!values.surgeryNameConfirmed && patient.surgeryNameConfirmedAt) values.surgeryNameConfirmed = patient.surgeryNameConfirmedAt;
  tasks.filter((task) => task && task.patientId === patient.id && task.status === 'done').forEach((task) => {
    const key = LEGACY_PREOP_CHECK_KEYS[task.title];
    if (key && !values[key]) values[key] = task.completedAt || task.createdAt || patient.updatedAt || patient.createdAt || true;
  });
  const present = Object.entries(values).filter(([, value]) => Boolean(value));
  const eventCount = present.reduce((count, [key, value]) => count + (appendMigratedPreopEvent(events, patient, key, value) ? 1 : 0), 0);
  return { patientCount: present.length ? 1 : 0, eventCount };
}

function migratePreopRecordsToEvents(workspace, source, fromSchemaVersion) {
  const totals = { patientCount: 0, eventCount: 0 };
  const sourceTasks = Array.isArray(source.tasks) ? source.tasks : [];
  [...(source.patients || []), ...(source.archivedPatients || [])].forEach((patient) => {
    const result = migratePatientPreopRecord(workspace.clinicalEvents, patient, [...sourceTasks, ...(patient.tasks || [])]);
    totals.patientCount += result.patientCount;
    totals.eventCount += result.eventCount;
  });
  (source.revokedRegistrations || []).forEach((entry, index) => {
    const target = workspace.revokedRegistrations[index];
    if (!target) return;
    const sourcePatient = (entry && entry.patient) || {};
    const sourceRecords = (entry && entry.records) || {};
    const result = migratePatientPreopRecord(target.records.clinicalEvents, sourcePatient, sourceRecords.tasks || []);
    totals.patientCount += result.patientCount;
    totals.eventCount += result.eventCount;
  });
  workspace.meta.preopMigration = {
    fromSchemaVersion,
    patientCount: totals.patientCount,
    eventCount: totals.eventCount,
    migratedAt: new Date().toISOString(),
  };
  return totals;
}

function normalizeRevokedRegistration(entry, fallbackDepartment = '轮转通用') {
  const patient = normalizePatient((entry && entry.patient) || {}, false, fallbackDepartment);
  const records = (entry && entry.records) || {};
  return {
    id: (entry && entry.id) || uniqueId('revoked-registration'),
    patient,
    records: {
      rounds: normalizePlainTextRounds(records.rounds, patient.id),
      tasks: (records.tasks || []).map((item) => normalizeTask(item, patient.id)),
      taskDrafts: Array.isArray(records.taskDrafts) ? clone(records.taskDrafts) : [],
      stageLogs: Array.isArray(records.stageLogs) ? clone(records.stageLogs) : [],
      devices: (records.devices || []).map((item) => normalizeDevice(item, false)),
      observations: (records.observations || []).map((item) => normalizeObservation(item, patient)),
      clinicalEvents: (records.clinicalEvents || []).map(normalizeClinicalEvent),
      pathologySpecimens: (records.pathologySpecimens || []).map(normalizePathologySpecimen),
      medicalRecordCompletions: normalizeMedicalRecordCompletions(records.medicalRecordCompletions, patient.id),
    },
    revokedAt: (entry && entry.revokedAt) || new Date().toISOString(),
  };
}

function normalizePathologySpecimen(specimen) {
  return {
    id: specimen.id || uniqueId('specimen'), patientId: specimen.patientId,
    name: specimen.name || '手术标本', status: specimen.status || 'retained',
    note: specimen.note || '', createdAt: specimen.createdAt || new Date().toISOString(),
    updatedAt: specimen.updatedAt || specimen.createdAt || new Date().toISOString(),
  };
}

function isSeedDemoPatient(patient) {
  return /^DEMO-/.test(patient.id || '') && /界面演示/.test(patient.diagnosis || '');
}

function isPlasticSimulationPatient(patient) {
  return /^SIM-PLASTIC-/.test(patient.id || '');
}

function purgePlasticSimulationRecords(workspace) {
  const patientIds = new Set([...workspace.patients, ...workspace.archivedPatients].filter(isPlasticSimulationPatient).map((patient) => patient.id));
  if (!patientIds.size) return false;
  workspace.patients = workspace.patients.filter((patient) => !patientIds.has(patient.id));
  workspace.archivedPatients = workspace.archivedPatients.filter((patient) => !patientIds.has(patient.id));
  workspace.rounds = workspace.rounds.filter((item) => !patientIds.has(item.patientId));
  workspace.tasks = workspace.tasks.filter((item) => !patientIds.has(item.patientId));
  workspace.taskDrafts = workspace.taskDrafts.filter((item) => !patientIds.has(item.patientId));
  workspace.stageLogs = workspace.stageLogs.filter((item) => !patientIds.has(item.patientId));
  workspace.devices = workspace.devices.filter((item) => !patientIds.has(item.patientId));
  workspace.observations = workspace.observations.filter((item) => !patientIds.has(item.patientId));
  workspace.clinicalEvents = workspace.clinicalEvents.filter((item) => !patientIds.has(item.patientId));
  workspace.pathologySpecimens = workspace.pathologySpecimens.filter((item) => !patientIds.has(item.patientId));
  workspace.medicalRecordCompletions = workspace.medicalRecordCompletions.filter((item) => !patientIds.has(item.patientId));
  return true;
}

function workflowCompatibility(source = {}) {
  const settings = source.settings || {};
  return {
    retiredAt: new Date().toISOString(),
    stages: clone(settings.stages || []),
    stageRequirements: clone(settings.stageRequirements || {}),
    departmentWorkflows: clone(settings.departmentWorkflows || {}),
    departmentTemplates: clone(settings.departmentTemplates || {}),
    procedureTemplates: clone(settings.procedureTemplates || {}),
    templates: clone(source.templates || []),
    patientStages: [...(source.patients || []), ...(source.archivedPatients || [])].map((patient) => ({ patientId: patient.id, stage: patient.stage || '', workflowOverride: clone(patient.workflowOverride || []) })),
    stageLogs: clone(source.stageLogs || []),
  };
}

function legacyWorkflowTask(task) {
  const sourceRef = `${task.sourceRef || ''}`;
  return ['阶段要求', '已取消的阶段要求', RETIRED_WORKFLOW_TASK_SOURCE, '路径建议'].includes(task.source)
    || sourceRef.startsWith('stage:') || sourceRef.startsWith('rule:');
}

function retireLegacyWorkflowTasks(workspace) {
  workspace.tasks.forEach((task) => {
    if (task.status === 'done' || !legacyWorkflowTask(task)) return;
    const sourceRef = `${task.sourceRef || ''}`;
    const ruleId = sourceRef.startsWith('rule:') ? sourceRef.split(':')[1] : '';
    const customPathTask = task.source === '路径建议' && !BUILTIN_PATH_RULE_IDS.has(ruleId) && !sourceRef.startsWith('drain:');
    if (customPathTask) {
      task.source = MIGRATED_CUSTOM_PATH_SOURCE;
      task.sourceRef = '';
      task.priority = '普通';
    } else {
      task.source = RETIRED_WORKFLOW_TASK_SOURCE;
    }
    task.stage = '';
    task.critical = false;
    task.effect = null;
  });
}

function migrateLegacy(legacy) {
  const workspace = emptyWorkspace();
  if (!legacy || !Array.isArray(legacy.patients)) return workspace;
  workspace.legacyWorkflow = workflowCompatibility(legacy);
  workspace.settings = normalizeSettings(legacy.settings);
  legacy.patients.filter((patient) => !isSeedDemoPatient(patient)).forEach((patient) => {
    workspace.patients.push(normalizePatient(patient, false, workspace.settings.activeDepartment));
    workspace.rounds.push(...normalizePlainTextRounds(patient.rounds, patient.id));
    (patient.tasks || []).forEach((task) => workspace.tasks.push(normalizeTask(task, patient.id)));
    (patient.stageHistory || []).forEach((entry) => workspace.stageLogs.push({
      id: uniqueId('stage-log'), patientId: patient.id, fromStage: '', toStage: entry.stage,
      action: 'legacy', note: '', at: entry.at || new Date().toISOString(),
    }));
  });
  migratePreopRecordsToEvents(workspace, legacy, 1);
  retireLegacyWorkflowTasks(workspace);
  workspace.meta.migratedFrom = 1;
  workspace.meta.migratedAt = new Date().toISOString();
  return workspace;
}

function normalizeWorkspace(saved) {
  if (!saved) return emptyWorkspace();
  const sourceSchemaVersion = Number(saved.schemaVersion || 1);
  if (sourceSchemaVersion > SCHEMA_VERSION) throw new Error('该数据来自更新版本，当前版本不会覆盖它，请先升级小程序后再打开或恢复');
  const appearsFlat = sourceSchemaVersion >= 2 || Array.isArray(saved.archivedPatients) || Array.isArray(saved.devices) || Array.isArray(saved.pathologySpecimens);
  if (!appearsFlat) return migrateLegacy(saved);
  const workspace = emptyWorkspace();
  workspace.settings = normalizeSettings(saved.settings);
  workspace.patients = (saved.patients || []).map((item) => normalizePatient(item, false, workspace.settings.activeDepartment));
  workspace.archivedPatients = (saved.archivedPatients || []).map((item) => normalizePatient(item, true, workspace.settings.activeDepartment));
  workspace.rounds = normalizePlainTextRounds(saved.rounds);
  workspace.tasks = (saved.tasks || []).map((item) => normalizeTask(item, item.patientId));
  workspace.taskDrafts = Array.isArray(saved.taskDrafts) ? clone(saved.taskDrafts) : [];
  workspace.stageLogs = Array.isArray(saved.stageLogs) ? clone(saved.stageLogs) : [];
  workspace.devices = (saved.devices || []).map((item) => normalizeDevice(item, sourceSchemaVersion < SCHEMA_VERSION));
  const patientMap = Object.fromEntries([...workspace.patients, ...workspace.archivedPatients].map((patient) => [patient.id, patient]));
  workspace.observations = (saved.observations || []).map((item) => normalizeObservation(item, patientMap[item.patientId]))
    .filter((item) => item.entryType === 'removed' || Number.isFinite(item.value));
  workspace.clinicalEvents = (saved.clinicalEvents || []).map(normalizeClinicalEvent);
  workspace.pathologySpecimens = (saved.pathologySpecimens || []).map(normalizePathologySpecimen);
  workspace.medicalRecordCompletions = normalizeMedicalRecordCompletions(saved.medicalRecordCompletions);
  workspace.revokedRegistrations = (saved.revokedRegistrations || []).map((entry) => normalizeRevokedRegistration(entry, workspace.settings.activeDepartment));
  workspace.meta = { ...workspace.meta, ...(saved.meta || {}) };
  workspace.legacyWorkflow = saved.legacyWorkflow ? clone(saved.legacyWorkflow) : (sourceSchemaVersion < 10 ? workflowCompatibility(saved) : null);
  if (sourceSchemaVersion < 12) migratePreopRecordsToEvents(workspace, saved, sourceSchemaVersion);
  purgePlasticSimulationRecords(workspace);
  [...workspace.patients, ...workspace.archivedPatients].forEach((patient) => {
    if (patient.legacyDrainPresent && !workspace.devices.some((device) => device.patientId === patient.id && device.type === 'drain')) {
      workspace.devices.push(normalizeDevice({ patientId: patient.id, type: 'drain', name: '引流 1', status: 'active' }, true));
    }
  });
  workspace.devices.filter((device) => device.type === 'drain' && device.status === 'removed').forEach((device) => {
    const hasRemovalRecord = workspace.observations.some((item) => item.deviceId === device.id && item.entryType === 'removed');
    if (!hasRemovalRecord) workspace.observations.push(normalizeObservation({
      patientId: device.patientId, deviceId: device.id, entryType: 'removed', pod: null, recordedAt: device.removedAt || new Date().toISOString(),
    }, patientMap[device.patientId]));
  });
  if (sourceSchemaVersion < 10) retireLegacyWorkflowTasks(workspace);
  if (sourceSchemaVersion !== SCHEMA_VERSION) {
    workspace.meta.migratedFrom = sourceSchemaVersion;
    workspace.meta.migratedAt = new Date().toISOString();
  }
  return workspace;
}

export function getWorkspace() {
  const saved = wx.getStorageSync(STORAGE_KEY);
  if (saved) {
    if (Number(saved.schemaVersion || 1) > SCHEMA_VERSION) return saved;
    const needsClinicalUpgrade = Number((saved.settings && saved.settings.clinicalPresetVersion) || 0) < 5;
    const needsSchemaUpgrade = Number(saved.schemaVersion || 1) < SCHEMA_VERSION;
    const hasPlasticSimulationData = [...(saved.patients || []), ...(saved.archivedPatients || [])].some(isPlasticSimulationPatient);
    const needsRoundCleanup = hasLegacyStructuredRounds(saved);
    const workspace = normalizeWorkspace(saved);
    if (needsClinicalUpgrade || needsSchemaUpgrade || hasPlasticSimulationData || needsRoundCleanup) {
      if (needsSchemaUpgrade) {
        wx.setStorageSync(V4_MIGRATION_SNAPSHOT_KEY, clone(saved));
        if (Number(saved.schemaVersion || 1) < 12) wx.setStorageSync(PREOP_MIGRATION_SNAPSHOT_KEY, clone(saved));
        if (Number(saved.schemaVersion || 1) < 13) wx.setStorageSync(MEDICAL_RECORD_MIGRATION_SNAPSHOT_KEY, clone(saved));
      }
      if (hasPlasticSimulationData) wx.setStorageSync(SIMULATION_CLEANUP_SNAPSHOT_KEY, clone(saved));
      return saveWorkspace(workspace);
    }
    return workspace;
  }
  const previous = wx.getStorageSync(PREVIOUS_STORAGE_KEY);
  if (previous) {
    wx.setStorageSync(MIGRATION_SNAPSHOT_KEY, clone(previous));
    const workspace = normalizeWorkspace(previous);
    return saveWorkspace(workspace);
  }
  const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY);
  if (legacy) wx.setStorageSync(MIGRATION_SNAPSHOT_KEY, clone(legacy));
  const workspace = migrateLegacy(legacy);
  saveWorkspace(workspace);
  return workspace;
}

export function saveWorkspace(workspace) {
  const next = normalizeWorkspace({ ...workspace, schemaVersion: SCHEMA_VERSION });
  next.meta.updatedAt = new Date().toISOString();
  wx.setStorageSync(STORAGE_KEY, next);
  return next;
}

export function setActiveDepartment(department) {
  const workspace = getWorkspace();
  if (!workspace.settings.departments.includes(department)) return false;
  workspace.settings.activeDepartment = department;
  saveWorkspace(workspace);
  return true;
}

export function getPrivacyMaskEnabled() {
  return Boolean(getWorkspace().settings.privacyMaskEnabled);
}

export function setPrivacyMaskEnabled(enabled) {
  const workspace = getWorkspace();
  workspace.settings.privacyMaskEnabled = Boolean(enabled);
  saveWorkspace(workspace);
  return workspace.settings.privacyMaskEnabled;
}

export function restoreWorkspace(workspace, { allowDateWarnings = false } = {}) {
  const prepared = prepareBackupImport(workspace, { allowDateWarnings });
  wx.setStorageSync(RESTORE_SNAPSHOT_KEY, clone(getWorkspace()));
  const normalized = prepared.workspace;
  saveWorkspace(normalized);
  return normalized;
}

export function getRestoreSnapshotSummary() {
  const snapshot = wx.getStorageSync(RESTORE_SNAPSHOT_KEY);
  if (!snapshot) return null;
  try {
    const prepared = prepareBackupImport(snapshot, { allowDateWarnings: true });
    return { ...getBackupSummary(prepared.workspace), savedAt: (snapshot.meta && snapshot.meta.updatedAt) || '', dateWarning: prepared.dateWarning || '' };
  } catch (error) {
    return { invalid: true, error: error.message || '恢复前快照无法校验' };
  }
}

export function restorePreviousWorkspace() {
  const snapshot = wx.getStorageSync(RESTORE_SNAPSHOT_KEY);
  if (!snapshot) return { ok: false, error: '暂无可回退的恢复前快照' };
  try {
    const prepared = prepareBackupImport(snapshot, { allowDateWarnings: true });
    wx.setStorageSync(RESTORE_SNAPSHOT_KEY, clone(getWorkspace()));
    saveWorkspace(prepared.workspace);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || '恢复前快照无法回退' };
  }
}

export function prepareBackupImport(workspace, { allowDateWarnings = false } = {}) {
  if (!workspace || !Array.isArray(workspace.patients)) throw new Error('备份数据结构不完整');
  const sourceSchemaVersion = Number(workspace.schemaVersion || 1);
  if (!Number.isFinite(sourceSchemaVersion) || sourceSchemaVersion < 1) throw new Error('备份数据版本无效');
  if (sourceSchemaVersion > SCHEMA_VERSION) throw new Error('该备份来自更新版本，请先升级小程序后再恢复，当前数据不会被覆盖');
  const normalized = normalizeWorkspace(workspace);
  const dateError = validateWorkspacePatientDates(normalized);
  if (dateError && !allowDateWarnings) throw new Error(`备份中存在无效日期：${dateError}`);
  const integrity = getWorkspaceIntegrity(normalized);
  if (!integrity.ok) throw new Error(`备份关联校验失败：${integrity.errors[0]}`);
  return { workspace: normalized, sourceSchemaVersion, targetSchemaVersion: SCHEMA_VERSION, migrated: sourceSchemaVersion !== SCHEMA_VERSION, integrity, dateWarning: dateError };
}

export function getBackupSummary(workspace) {
  return {
    schemaVersion: workspace.schemaVersion || 1,
    activePatients: (workspace.patients || []).length,
    archivedPatients: (workspace.archivedPatients || []).length,
    rounds: (workspace.rounds || []).length,
    tasks: (workspace.tasks || []).length,
    medicalRecordCompletions: (workspace.medicalRecordCompletions || []).length,
    revokedPatients: (workspace.revokedRegistrations || []).length,
    updatedAt: workspace.meta && workspace.meta.updatedAt ? workspace.meta.updatedAt : '',
    lastBackupVerification: workspace.meta && workspace.meta.lastBackupVerification ? workspace.meta.lastBackupVerification : null,
    preopMigration: workspace.meta && workspace.meta.preopMigration ? clone(workspace.meta.preopMigration) : null,
  };
}

export function getWorkspaceIntegrity(workspace) {
  const source = workspace || getWorkspace();
  const allPatients = [...(source.patients || []), ...(source.archivedPatients || [])];
  const patientIds = allPatients.map((item) => item.id);
  const knownPatientIds = new Set(patientIds);
  const errors = [];
  if (new Set(patientIds).size !== patientIds.length) errors.push('存在重复住院号或病案号');
  PATIENT_RECORD_KEYS.forEach((key) => {
    (source[key] || []).forEach((item) => {
      if (item && item.patientId && !knownPatientIds.has(item.patientId)) errors.push(`${key} 中存在无法关联的患者记录`);
    });
  });
  const deviceIds = new Set((source.devices || []).map((item) => item.id));
  (source.observations || []).forEach((item) => {
    if (item.deviceId && !deviceIds.has(item.deviceId)) errors.push('存在无法关联的引流记录');
  });
  (source.revokedRegistrations || []).forEach((entry) => {
    const patientId = entry && entry.patient && entry.patient.id;
    if (!patientId) { errors.push('回收站中存在缺少患者标识的记录'); return; }
    PATIENT_RECORD_KEYS.forEach((key) => {
      (entry.records && entry.records[key] ? entry.records[key] : []).forEach((item) => {
        if (item && item.patientId && item.patientId !== patientId) errors.push('回收站中存在患者关联不一致的记录');
      });
    });
    const revokedDeviceIds = new Set(((entry.records && entry.records.devices) || []).map((item) => item.id));
    ((entry.records && entry.records.observations) || []).forEach((item) => {
      if (item.deviceId && !revokedDeviceIds.has(item.deviceId)) errors.push('回收站中存在无法关联的引流记录');
    });
  });
  return { ok: errors.length === 0, errors: Array.from(new Set(errors)) };
}

export function recordBackupVerification(kind = 'export', sourceSummary = null) {
  const workspace = getWorkspace();
  workspace.meta.lastBackupVerification = {
    at: new Date().toISOString(),
    kind,
    sourceSchemaVersion: Number((sourceSummary && sourceSummary.schemaVersion) || workspace.schemaVersion || SCHEMA_VERSION),
    sourceUpdatedAt: (sourceSummary && sourceSummary.updatedAt) || workspace.meta.updatedAt || '',
  };
  saveWorkspace(workspace);
  return workspace.meta.lastBackupVerification;
}

export function getPatient(id) {
  const workspace = getWorkspace();
  return workspace.patients.find((item) => item.id === id) || workspace.archivedPatients.find((item) => item.id === id);
}

export function getPatientRounds(patientId) {
  return getWorkspace().rounds.filter((item) => item.patientId === patientId && item.content.trim()).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

export function getPatientTasks(patientId, includeDone = true) {
  return getWorkspace().tasks.filter((item) => item.patientId === patientId && !legacyWorkflowTask(item) && (includeDone || item.status !== 'done'))
    .sort((a, b) => `${a.status}${a.dueAt}`.localeCompare(`${b.status}${b.dueAt}`));
}

export function getPatientBundle(id) {
  const patient = getPatient(id);
  if (!patient) return null;
  const workspace = getWorkspace();
  return {
    ...patient, rounds: getPatientRounds(id), tasks: getPatientTasks(id),
    devices: workspace.devices.filter((item) => item.patientId === id),
    observations: workspace.observations.filter((item) => item.patientId === id),
    clinicalEvents: workspace.clinicalEvents.filter((item) => item.patientId === id),
    pathologySpecimens: workspace.pathologySpecimens.filter((item) => item.patientId === id),
    medicalRecordCompletions: workspace.medicalRecordCompletions.filter((item) => item.patientId === id),
  };
}

function findPatientIdConflict(workspace, id, excludingId = '') {
  const active = workspace.patients.find((item) => item.id === id && item.id !== excludingId);
  if (active) return { ...active, archived: false };
  const archived = workspace.archivedPatients.find((item) => item.id === id && item.id !== excludingId);
  return archived ? { ...archived, archived: true } : null;
}

function duplicatePatientId(workspace, id, excludingId = '') {
  return Boolean(findPatientIdConflict(workspace, id, excludingId));
}

export function createPatient(patient) {
  const workspace = getWorkspace();
  const validation = validatePatientDraft(patient, {
    today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
    departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
    existingPatients: [...workspace.patients, ...workspace.archivedPatients],
  });
  if (!validation.ok) return { ok: false, error: patientDraftErrorText(validation), fieldErrors: validation.fieldErrors };
  const id = validation.value.id;
  const conflict = findPatientIdConflict(workspace, id);
  if (conflict) return { ok: false, error: `该住院号已存在于${conflict.archived ? '归档' : '在院'}患者（${conflict.department || '未分配科室'}），请先搜索核对` };
  const normalized = normalizePatient({ ...validation.value, id, admissionStateNeedsReview: false });
  workspace.patients.unshift(normalized);
  saveWorkspace(workspace);
  return { ok: true, patient: normalized };
}

export function createPatientsAtomically(patients) {
  const workspace = getWorkspace();
  const source = Array.isArray(patients) ? patients : [];
  if (!source.length) return { ok: false, error: '请至少选择一位患者' };
  const ids = new Set([...workspace.patients, ...workspace.archivedPatients].map((item) => item.id));
  const normalizedPatients = [];
  for (const patient of source) {
    const validation = validatePatientDraft(patient, {
      today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
      departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
      existingPatients: [...workspace.patients, ...workspace.archivedPatients, ...normalizedPatients],
    });
    if (!validation.ok) return { ok: false, error: patientDraftErrorText(validation), fieldErrors: validation.fieldErrors };
    const id = validation.value.id;
    if (ids.has(id)) return { ok: false, error: `住院号“${id}”已存在，请重新解析并核对` };
    ids.add(id);
    normalizedPatients.push(normalizePatient({ ...validation.value, id, admissionStateNeedsReview: false }));
  }
  workspace.patients.unshift(...normalizedPatients);
  saveWorkspace(workspace);
  return { ok: true, patients: normalizedPatients };
}

export function updatePatient(patientId, changes) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!patient) return { ok: false, error: '未找到可编辑的在院患者' };
  const { correctionReason: ignoredCorrectionReason, ...patientChanges } = changes;
  const validation = validatePatientDraft({ ...patient, ...patientChanges }, {
    today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
    departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
    existingPatients: [...workspace.patients, ...workspace.archivedPatients], originalPatientId: patientId,
  });
  if (!validation.ok) return { ok: false, error: patientDraftErrorText(validation), fieldErrors: validation.fieldErrors };
  const nextId = validation.value.id;
  const conflict = nextId !== patientId ? findPatientIdConflict(workspace, nextId, patientId) : null;
  if (conflict) return { ok: false, error: `该住院号已存在于${conflict.archived ? '归档' : '在院'}患者（${conflict.department || '未分配科室'}），请先搜索核对` };
  const previousSurgeryName = patient.surgeryName;
  const previousSurgeon = patient.surgeon;
  const auditFields = [
    ['name', '姓名'], ['id', '住院号'], ['ward', '病房'], ['bed', '床位'], ['department', '科室'], ['patientType', '患者类别'],
    ['diagnosis', '诊断'], ['allergyStatus', '过敏状态'], ['allergies', '过敏史'], ['surgeryName', '术式草稿'], ['confirmedSurgeryName', '正式术式'],
    ['surgeon', '主刀医生'], ['firstAssistant', '一助医生'], ['admissionState', '入院状态'], ['admissionDate', '入院日期'], ['surgeryDate', '手术日期'], ['plannedDischargeDate', '计划出院日期'], ['actualDischargeDate', '实际出院日期'],
  ];
  const before = Object.fromEntries(auditFields.map(([key]) => [key, `${patient[key] || ''}`]));
  Object.assign(patient, normalizePatient({ ...patient, ...validation.value, id: nextId, admissionStateNeedsReview: false, updatedAt: new Date().toISOString() }));
  // 拟行术式或主刀变更后，正式术式需重新人工核实；其余独立核查记录不自动改写。
  if (patient.department === '整形外科' && !hasActualDischarge(patient) && (patient.surgeryName !== previousSurgeryName || patient.surgeon !== previousSurgeon)) {
    patient.confirmedSurgeryName = '';
    patient.surgeryNameConfirmedAt = '';
  }
  if (nextId !== patientId) {
    workspace.rounds.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.tasks.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.taskDrafts.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.stageLogs.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.devices.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.observations.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.clinicalEvents.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.pathologySpecimens.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
    workspace.medicalRecordCompletions.forEach((item) => { if (item.patientId === patientId) item.patientId = nextId; });
  }
  const revisions = auditFields.filter(([key]) => before[key] !== `${patient[key] || ''}`)
    .map(([key, label]) => `${label}：${before[key] || '未填写'} → ${patient[key] || '未填写'}`);
  if (revisions.length) workspace.clinicalEvents.push(normalizeClinicalEvent({
    patientId: nextId, type: 'patient-revision', value: '关键资料已修改', note: revisions.join('；'), at: new Date().toISOString(),
  }));
  saveWorkspace(workspace);
  return { ok: true, patient };
}

export function confirmSurgeryName(patientId, confirmedSurgeryName) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  const value = `${confirmedSurgeryName || ''}`.trim();
  if (!patient) return { ok: false, error: '未找到在院患者' };
  if (!value) return { ok: false, error: '请填写正式手术名称' };
  const at = new Date().toISOString();
  patient.confirmedSurgeryName = value;
  patient.surgeryNameConfirmedAt = at;
  patient.updatedAt = at;
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: 'surgery-name-confirmed', value, note: '已与主刀确认正式术式', at }));
  saveWorkspace(workspace);
  return { ok: true, patient };
}

// Direct discharge is a factual state change. It never consults legacy workflow data.
export function dischargePatient(patientId, selectedDischargeDate = todayKey()) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!patient) return { ok: false, error: '未找到可编辑的在院患者' };
  if (patient.admissionState !== 'admitted') return { ok: false, error: '待入院患者不能确认出院，请先核实入院状态' };
  const dischargeDate = `${selectedDischargeDate || ''}`.trim();
  if (!dischargeDate || !validDateKey(dischargeDate)) return { ok: false, error: '出院日期格式无效' };
  const dateError = validatePatientDates({ ...patient, actualDischargeDate: dischargeDate });
  if (dateError) return { ok: false, error: dateError };
  const correctingDischarge = Boolean(patient.actualDischargeDate);
  const dischargedAt = new Date().toISOString();
  patient.actualDischargeDate = dischargeDate;
  patient.updatedAt = dischargedAt;
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: correctingDischarge ? 'patient-discharge-corrected' : 'patient-discharged', value: dischargeDate, note: `实际出院日期：${dischargeDate}`, at: dischargedAt }));
  saveWorkspace(workspace);
  return { ok: true, patient };
}

export function revertPatientDischarge(patientId, reason) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  const note = `${reason || ''}`.trim();
  if (!patient) return { ok: false, error: '未找到可编辑的在院患者' };
  if (!patient.actualDischargeDate) return { ok: false, error: '患者尚未确认实际出院日期' };
  if (!note) return { ok: false, error: '请填写撤回出院原因' };
  patient.actualDischargeDate = '';
  patient.updatedAt = new Date().toISOString();
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: 'patient-discharge-reverted', value: '在院', note, at: patient.updatedAt }));
  saveWorkspace(workspace);
  return { ok: true, patient };
}

// This operation is reserved for a cancelled admission or an accidental local entry.
// Discharged and archived records must remain available for continuity of records.
export function revokePatientRegistration(patientId) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!patient) return { ok: false, error: '仅未出院患者可撤销建档' };
  if (getPatientStatus(patient) === '已出院') return { ok: false, error: '已出院患者不能撤销建档，请保留归档记录' };
  const revokedAt = new Date().toISOString();
  const records = {};
  PATIENT_RECORD_KEYS.forEach((key) => { records[key] = workspace[key].filter((item) => item.patientId === patientId); });
  records.clinicalEvents.unshift(normalizeClinicalEvent({ patientId, type: 'patient-registration-revoked', value: '已移入本地回收站', note: '仅用于临时取消或误建档', at: revokedAt }));
  workspace.revokedRegistrations.unshift(normalizeRevokedRegistration({ id: uniqueId('revoked-registration'), patient: clone(patient), records, revokedAt }));
  workspace.patients = workspace.patients.filter((item) => item.id !== patientId);
  PATIENT_RECORD_KEYS.forEach((key) => {
    workspace[key] = workspace[key].filter((item) => item.patientId !== patientId);
  });
  workspace.stageLogs = workspace.stageLogs.filter((item) => item.patientId !== patientId);
  saveWorkspace(workspace);
  return { ok: true, revokedAt };
}

export function getRevokedRegistrations() {
  const workspace = getWorkspace();
  return (workspace.revokedRegistrations || []).map((entry) => ({
    ...clone(entry),
    restorable: !findPatientIdConflict(workspace, entry.patient.id),
  })).sort((a, b) => `${b.revokedAt}`.localeCompare(`${a.revokedAt}`));
}

export function restoreRevokedRegistration(revocationId) {
  const workspace = getWorkspace();
  const index = workspace.revokedRegistrations.findIndex((item) => item.id === revocationId);
  if (index < 0) return { ok: false, error: '未找到已撤销建档记录' };
  const entry = workspace.revokedRegistrations[index];
  const patientId = entry.patient.id;
  const conflict = findPatientIdConflict(workspace, patientId);
  if (conflict) return { ok: false, error: '当前已有相同住院号，无法恢复' };
  const recordIds = new Set();
  for (const key of PATIENT_RECORD_KEYS) {
    const existingIds = new Set((workspace[key] || []).map((item) => item.id).filter(Boolean));
    for (const item of entry.records[key] || []) {
      if (item.id && recordIds.has(`${key}:${item.id}`)) return { ok: false, error: '回收站记录重复，无法安全恢复' };
      if (item.id && existingIds.has(item.id)) return { ok: false, error: '现有记录与回收站记录冲突，无法安全恢复' };
      recordIds.add(`${key}:${item.id}`);
    }
  }
  const restoredPatient = normalizePatient(entry.patient, false, workspace.settings.activeDepartment);
  workspace.patients.unshift(restoredPatient);
  PATIENT_RECORD_KEYS.forEach((key) => {
    workspace[key].push(...clone(entry.records[key] || []).map((item) => ({ ...item, patientId })));
  });
  workspace.revokedRegistrations.splice(index, 1);
  saveWorkspace(workspace);
  return { ok: true, patient: restoredPatient };
}

export function getDischargeReadiness(patient, suppliedWorkspace) {
  const workspace = suppliedWorkspace || getWorkspace();
  const discharged = Boolean(patient) && hasActualDischarge(patient);
  if (!discharged) return { discharged: false, pendingCriticalTasks: [], noticeDone: false, pendingLabels: [], readyToArchive: false };
  const pendingCriticalTasks = [];
  const noticeDone = discharged && workspace.clinicalEvents.some((event) => event.patientId === patient.id && event.type === 'cooperation-discharge-notice');
  const pendingLabels = [
    ...pendingCriticalTasks.map((task) => task.title),
    ...(noticeDone ? [] : ['待通知一助并标记完成']),
  ];
  return { discharged, pendingCriticalTasks, noticeDone, pendingLabels, readyToArchive: discharged && pendingLabels.length === 0 };
}

export function archivePatient(patientId) {
  const workspace = getWorkspace();
  const index = workspace.patients.findIndex((item) => item.id === patientId);
  if (index < 0) return { ok: false, error: '未找到在院患者' };
  const patient = workspace.patients[index];
  const readiness = getDischargeReadiness(patient, workspace);
  if (!readiness.discharged) return { ok: false, error: '请先确认实际出院日期' };
  if (!readiness.noticeDone) return { ok: false, error: '请先通知一助老师并标记“已通知一助”' };
  workspace.patients.splice(index, 1);
  patient.archived = true;
  patient.archivedAt = new Date().toISOString();
  workspace.archivedPatients.unshift(patient);
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: 'patient-archived', value: '已归档', note: '', at: patient.archivedAt }));
  saveWorkspace(workspace);
  return { ok: true };
}

export function saveRound(patientId, round) {
  const workspace = getWorkspace();
  if (!workspace.patients.some((item) => item.id === patientId)) return { ok: false, error: '未找到在院患者' };
  let savedRound = normalizeRound({ ...round, id: round.id || uniqueId('round'), createdAt: round.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, patientId);
  if (!savedRound.content.trim()) return { ok: false, error: '查房文字不能为空' };
  const existingIndex = workspace.rounds.findIndex((item) => item.id === savedRound.id || (!round.id && item.patientId === patientId && item.date === savedRound.date));
  if (existingIndex >= 0) savedRound = { ...savedRound, id: workspace.rounds[existingIndex].id, createdAt: workspace.rounds[existingIndex].createdAt };
  if (existingIndex >= 0) workspace.rounds[existingIndex] = savedRound;
  else workspace.rounds.unshift(savedRound);
  saveWorkspace(workspace);
  return { ok: true, round: savedRound };
}

export function addTask(patientId, task) {
  const workspace = getWorkspace();
  if (!workspace.patients.some((item) => item.id === patientId)) return { ok: false, error: '归档患者不能新增任务' };
  const payload = typeof task === 'string' ? { title: task } : task;
  if (!payload.title || !payload.title.trim()) return { ok: false, error: '任务标题不能为空' };
  if (payload.sourceRef && workspace.tasks.some((item) => item.patientId === patientId && item.sourceRef === payload.sourceRef)) {
    return { ok: false, error: '相同来源的任务已存在' };
  }
  const { id: ignoredTaskId, ...taskPayload } = payload;
  const saved = normalizeTask({ ...taskPayload, id: uniqueId('task'), dueAt: taskPayload.dueAt || todayKey(), category: taskPayload.category || '其他', priority: taskPayload.priority || '普通', source: taskPayload.source || '手动添加' }, patientId);
  workspace.tasks.unshift(saved);
  saveWorkspace(workspace);
  return { ok: true, task: saved };
}

export function setTaskDone(patientId, taskId, done, completionNote = '') {
  const workspace = getWorkspace();
  const task = workspace.tasks.find((item) => item.patientId === patientId && item.id === taskId);
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!task || !patient) return { ok: false, error: '未找到可完成的任务' };
  task.status = done ? 'done' : 'todo';
  task.completionNote = done ? completionNote.trim() : '';
  task.completedAt = done ? new Date().toISOString() : '';
  saveWorkspace(workspace);
  return { ok: true };
}

export function toggleTask(patientId, taskId) {
  const task = getWorkspace().tasks.find((item) => item.patientId === patientId && item.id === taskId);
  return task ? setTaskDone(patientId, taskId, task.status !== 'done') : false;
}

export function addSettingItem(category, value) {
  const workspace = getWorkspace();
  const list = workspace.settings[category];
  if (!Array.isArray(list) || list.includes(value) || (category === 'departments' && (workspace.settings.archivedDepartments || []).includes(value))) return false;
  list.push(value);
  saveWorkspace(workspace);
  return true;
}

export function getDepartmentUsage(department) {
  const workspace = getWorkspace();
  const name = `${department || ''}`.trim();
  const activePatients = workspace.patients.filter((patient) => patient.department === name).length;
  const archivedPatients = workspace.archivedPatients.filter((patient) => patient.department === name).length;
  const revokedPatients = workspace.revokedRegistrations.filter((entry) => entry && entry.patient && entry.patient.department === name).length;
  return { activePatients, archivedPatients, revokedPatients, totalPatients: activePatients + archivedPatients + revokedPatients };
}

export function archiveDepartment(department) {
  const workspace = getWorkspace();
  const name = `${department || ''}`.trim();
  if (!workspace.settings.departments.includes(name)) return { ok: false, error: '该科室不存在或已归档' };
  if (workspace.settings.departments.length <= 1) return { ok: false, error: '请至少保留一个在用科室' };
  if (workspace.settings.activeDepartment === name) return { ok: false, error: '请先切换当前工作科室，再归档' };
  workspace.settings.departments = workspace.settings.departments.filter((item) => item !== name);
  workspace.settings.archivedDepartments = [...(workspace.settings.archivedDepartments || []), name];
  saveWorkspace(workspace);
  return { ok: true };
}

export function restoreDepartment(department) {
  const workspace = getWorkspace();
  const name = `${department || ''}`.trim();
  if (!(workspace.settings.archivedDepartments || []).includes(name)) return { ok: false, error: '该归档科室不存在' };
  workspace.settings.archivedDepartments = workspace.settings.archivedDepartments.filter((item) => item !== name);
  workspace.settings.departments.push(name);
  saveWorkspace(workspace);
  return { ok: true };
}

export function moveDepartment(department, direction) {
  const workspace = getWorkspace();
  const departments = workspace.settings.departments;
  const index = departments.indexOf(department);
  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const targetIndex = index + offset;
  if (index < 0 || !offset || targetIndex < 0 || targetIndex >= departments.length) return false;
  [departments[index], departments[targetIndex]] = [departments[targetIndex], departments[index]];
  saveWorkspace(workspace);
  return true;
}

export function deleteDepartmentPermanently(department) {
  const workspace = getWorkspace();
  const name = `${department || ''}`.trim();
  const activeDepartments = workspace.settings.departments;
  const archivedDepartments = workspace.settings.archivedDepartments || [];
  const isActive = activeDepartments.includes(name);
  if (!isActive && !archivedDepartments.includes(name)) return { ok: false, error: '该科室不存在' };
  if (isActive && activeDepartments.length <= 1) return { ok: false, error: '请至少保留一个在用科室' };
  if (workspace.settings.activeDepartment === name) return { ok: false, error: '请先切换当前工作科室，再移除' };
  const usage = getDepartmentUsage(name);
  const patientIds = new Set([...workspace.patients, ...workspace.archivedPatients]
    .filter((patient) => patient.department === name).map((patient) => patient.id));
  workspace.patients = workspace.patients.filter((patient) => patient.department !== name);
  workspace.archivedPatients = workspace.archivedPatients.filter((patient) => patient.department !== name);
  PATIENT_RECORD_KEYS.forEach((key) => { workspace[key] = workspace[key].filter((item) => !patientIds.has(item.patientId)); });
  workspace.revokedRegistrations = workspace.revokedRegistrations.filter((entry) => !(entry && entry.patient && entry.patient.department === name));
  workspace.settings.departments = activeDepartments.filter((item) => item !== name);
  workspace.settings.archivedDepartments = archivedDepartments.filter((item) => item !== name);
  delete workspace.settings.departmentWards[name];
  saveWorkspace(workspace);
  return { ok: true, usage };
}

export function addDepartmentWard(department, ward) {
  const workspace = getWorkspace();
  const departmentName = `${department || ''}`.trim();
  const wardName = `${ward || ''}`.trim();
  if (!workspace.settings.departments.includes(departmentName)) return { ok: false, error: '未找到该科室' };
  if (!wardName) return { ok: false, error: '请输入病房名称' };
  const configured = workspace.settings.departmentWards[departmentName] || [];
  // The single default ward is virtual. The first explicit value replaces it
  // without changing any historical patient record.
  if (configured.includes(wardName)) return { ok: false, error: '已存在同名病房' };
  workspace.settings.departmentWards[departmentName] = configured.length ? [...configured, wardName] : [wardName];
  saveWorkspace(workspace);
  return { ok: true };
}

export function moveDepartmentWard(department, ward, direction) {
  const workspace = getWorkspace();
  const departmentName = `${department || ''}`.trim();
  const wards = workspace.settings.departmentWards[departmentName];
  const index = Array.isArray(wards) ? wards.indexOf(ward) : -1;
  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const targetIndex = index + offset;
  if (index < 0 || !offset || targetIndex < 0 || targetIndex >= wards.length) return false;
  [wards[index], wards[targetIndex]] = [wards[targetIndex], wards[index]];
  saveWorkspace(workspace);
  return true;
}

export function removeDepartmentWard(department, ward) {
  const workspace = getWorkspace();
  const departmentName = `${department || ''}`.trim();
  const wardName = `${ward || ''}`.trim();
  const configured = workspace.settings.departmentWards[departmentName] || [];
  if (!configured.includes(wardName)) return { ok: false, error: '该病房不存在' };
  if (configured.length <= 1) return { ok: false, error: '请至少保留一个病房' };
  if ([...workspace.patients, ...workspace.archivedPatients].some((patient) => patient.department === departmentName && patient.ward === wardName)) return { ok: false, error: '该病房仍有关联患者，请先调整患者病房' };
  workspace.settings.departmentWards[departmentName] = configured.filter((item) => item !== wardName);
  saveWorkspace(workspace);
  return { ok: true };
}

export function removeSettingItem(category, value) {
  const workspace = getWorkspace();
  const list = workspace.settings[category];
  if (!Array.isArray(list)) return { ok: false, error: '该设置项不存在' };
  if (!list.includes(value)) return { ok: false, error: '该设置项不存在' };
  if (category === 'departments') {
    if (list.length <= 1) return { ok: false, error: '请至少保留一个在用科室' };
    if (workspace.settings.activeDepartment === value) return { ok: false, error: '请先切换当前工作科室，再移除' };
    if (getDepartmentUsage(value).totalPatients) return { ok: false, error: '该科室仍有关联患者或回收站记录，请归档科室或经二次确认永久删除' };
    delete workspace.settings.departmentWards[value];
  }
  workspace.settings[category] = list.filter((item) => item !== value);
  saveWorkspace(workspace);
  return { ok: true };
}

export function getPOD(surgeryDate, referenceDate = todayKey()) {
  if (!surgeryDate) return null;
  return dayDifference(referenceDate, surgeryDate);
}

function shiftDateKey(dateKey, offset) {
  if (!dateKey || !validDateKey(dateKey)) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
}

function shortDateLabel(dateKey) {
  if (!validDateKey(dateKey) || !dateKey) return '';
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}/${day}`;
}

function medicalRecordPodsThrough(maxPod) {
  const limit = Math.max(9, Math.floor(Number(maxPod) || 0));
  const pods = [1, 2, 3];
  for (let pod = 6; pod <= limit; pod += 3) pods.push(pod);
  return pods;
}

function nextMedicalRecordPod(currentPod) {
  const pod = Math.max(0, Math.floor(Number(currentPod) || 0));
  if (pod < 1) return 1;
  if (pod < 2) return 2;
  if (pod < 3) return 3;
  if (pod < 6) return 6;
  return (Math.floor(pod / 3) + 1) * 3;
}

function podRequirementKey(surgeryDate, pod) {
  return `pod:${surgeryDate}:${pod}`;
}

function dischargeRequirementKey(dischargeDate) {
  return `discharge:${dischargeDate}`;
}

function medicalRecordStatus(dueDate, referenceDate) {
  if (dueDate > referenceDate) return { status: 'future', overdueDays: 0, statusText: '未到' };
  const overdueDays = Math.max(0, dayDifference(referenceDate, dueDate) || 0);
  if (overdueDays === 0) return { status: 'today', overdueDays, statusText: '今日' };
  if (overdueDays >= 7) return { status: 'severe', overdueDays, statusText: `欠${overdueDays}天` };
  if (overdueDays >= 3) return { status: 'overdue', overdueDays, statusText: `欠${overdueDays}天` };
  return { status: 'warning', overdueDays, statusText: `欠${overdueDays}天` };
}

function completionLookup(workspace) {
  return new Map((workspace.medicalRecordCompletions || []).map((item) => [`${item.patientId}|${item.requirementKey}`, item]));
}

function buildMedicalRecordPodCell(patient, pod, referenceDate, completions) {
  const dueDate = shiftDateKey(patient.surgeryDate, pod);
  const requirementKey = podRequirementKey(patient.surgeryDate, pod);
  const afterActualDischarge = Boolean(patient.actualDischargeDate && dueDate > patient.actualDischargeDate);
  if (afterActualDischarge) {
    return { kind: 'pod', pod, dueDate, dateLabel: shortDateLabel(dueDate), requirementKey, status: 'not-applicable', statusText: '—', overdueDays: 0, done: false, actionable: false };
  }
  const completion = completions.get(`${patient.id}|${requirementKey}`);
  if (completion) {
    return { kind: 'pod', pod, dueDate, dateLabel: shortDateLabel(dueDate), requirementKey, status: 'done', statusText: '✓', overdueDays: 0, done: true, actionable: true };
  }
  const state = medicalRecordStatus(dueDate, referenceDate);
  return { kind: 'pod', pod, dueDate, dateLabel: shortDateLabel(dueDate), requirementKey, ...state, done: false, actionable: state.status !== 'future' };
}

function buildMedicalRecordDischargeCell(patient, podCells, referenceDate, completions) {
  const dischargeDate = patient.actualDischargeDate || patient.plannedDischargeDate || '';
  if (!dischargeDate || !validDateKey(dischargeDate)) {
    return { kind: 'discharge', requirementKey: '', dischargeDate: '', dateLabel: '未定', status: 'not-applicable', statusText: '—', overdueDays: 0, done: false, actionable: false, linkedPod: null, windowOpen: false };
  }
  const windowStart = shiftDateKey(dischargeDate, -1);
  const explicitKey = dischargeRequirementKey(dischargeDate);
  const explicitCompletion = completions.get(`${patient.id}|${explicitKey}`);
  const windowPods = podCells.filter((cell) => cell.status !== 'not-applicable' && cell.dueDate >= windowStart && cell.dueDate <= dischargeDate && cell.dueDate <= referenceDate);
  const completedWindowPod = windowPods.find((cell) => cell.done);
  const latestAvailableWindowPod = [...windowPods].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const linkedCell = completedWindowPod || latestAvailableWindowPod || null;
  const done = Boolean(explicitCompletion || completedWindowPod);
  const requirementKey = explicitCompletion ? explicitKey : linkedCell ? linkedCell.requirementKey : explicitKey;
  const windowOpen = referenceDate >= windowStart && referenceDate <= dischargeDate;
  let state;
  if (done) state = { status: 'done', overdueDays: 0, statusText: linkedCell && completedWindowPod ? `随POD${linkedCell.pod}` : '✓' };
  else if (referenceDate < windowStart) state = { status: 'future', overdueDays: 0, statusText: '未到' };
  else if (windowOpen) state = { status: linkedCell ? 'linked' : 'window', overdueDays: 0, statusText: linkedCell ? `随POD${linkedCell.pod}` : '待写' };
  else state = medicalRecordStatus(dischargeDate, referenceDate);
  return {
    kind: linkedCell && !explicitCompletion ? 'pod' : 'discharge', requirementKey, dischargeDate, dueDate: linkedCell && !explicitCompletion ? linkedCell.dueDate : dischargeDate,
    dateLabel: `${shortDateLabel(windowStart)}-${shortDateLabel(dischargeDate)}`, ...state, done,
    actionable: done || state.status !== 'future', linkedPod: linkedCell ? linkedCell.pod : null, windowOpen,
  };
}

function pendingMedicalRecordStatuses(status) {
  return ['warning', 'overdue', 'severe', 'today', 'window', 'linked'].includes(status);
}

function compareMedicalRecordPatients(a, b, wardOrder = []) {
  const wardIndex = (ward) => {
    const index = wardOrder.indexOf(ward);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const wardDifference = wardIndex(a.ward) - wardIndex(b.ward);
  if (wardDifference) return wardDifference;
  const wardNameDifference = `${a.ward || ''}`.localeCompare(`${b.ward || ''}`);
  if (wardNameDifference) return wardNameDifference;
  const leftBed = `${a.bed || ''}`.trim();
  const rightBed = `${b.bed || ''}`.trim();
  const leftBedNumber = /^\d+(?:\.\d+)?$/.test(leftBed) ? Number(leftBed) : Number.MAX_SAFE_INTEGER;
  const rightBedNumber = /^\d+(?:\.\d+)?$/.test(rightBed) ? Number(rightBed) : Number.MAX_SAFE_INTEGER;
  const bedDifference = leftBedNumber - rightBedNumber;
  if (bedDifference) return bedDifference;
  const bedNameDifference = leftBed.localeCompare(rightBed);
  if (bedNameDifference) return bedNameDifference;
  const patientNameDifference = `${a.name || ''}`.localeCompare(`${b.name || ''}`);
  return patientNameDifference || `${a.id || ''}`.localeCompare(`${b.id || ''}`);
}

export function getMedicalRecordBoard(referenceDate = todayKey(), suppliedWorkspace, department = '') {
  const workspace = suppliedWorkspace || getWorkspace();
  const activeDepartment = department || (workspace.settings && workspace.settings.activeDepartment) || '';
  const eligiblePatients = (workspace.patients || []).filter((patient) => patient.department === activeDepartment
    && patient.surgeryDate && validDateKey(patient.surgeryDate) && patient.surgeryDate <= referenceDate);
  const maxDisplayPod = eligiblePatients.reduce((maximum, patient) => {
    const endDate = patient.actualDischargeDate || referenceDate;
    const currentPod = Math.max(0, getPOD(patient.surgeryDate, endDate) || 0);
    const displayThrough = patient.actualDischargeDate ? currentPod : nextMedicalRecordPod(currentPod);
    return Math.max(maximum, displayThrough);
  }, 9);
  // Keep the newest requirement nearest the sticky patient column so recent gaps
  // remain visible without horizontal scrolling through the oldest POD dates.
  const podColumns = medicalRecordPodsThrough(maxDisplayPod).reverse();
  const completions = completionLookup(workspace);
  const pendingRequirements = new Map();
  const todayRequirements = new Set();
  const dischargeWindowRequirements = new Set();

  const patients = eligiblePatients.map((patient) => {
    const podCells = podColumns.map((pod) => buildMedicalRecordPodCell(patient, pod, referenceDate, completions));
    const dischargeCell = buildMedicalRecordDischargeCell(patient, podCells, referenceDate, completions);
    podCells.filter((cell) => !cell.done && pendingMedicalRecordStatuses(cell.status)).forEach((cell) => {
      pendingRequirements.set(`${patient.id}|${cell.requirementKey}`, cell);
      if (cell.status === 'today') todayRequirements.add(`${patient.id}|${cell.requirementKey}`);
    });
    if (!dischargeCell.done && pendingMedicalRecordStatuses(dischargeCell.status)) {
      const key = `${patient.id}|${dischargeCell.requirementKey}`;
      if (!pendingRequirements.has(key)) pendingRequirements.set(key, dischargeCell);
      if (dischargeCell.windowOpen) dischargeWindowRequirements.add(key);
    }
    const patientPending = [...pendingRequirements.entries()].filter(([key]) => key.startsWith(`${patient.id}|`)).map(([, value]) => value);
    return {
      ...patient, currentPod: getPOD(patient.surgeryDate, referenceDate), podCells, dischargeCell,
      discharged: Boolean(patient.actualDischargeDate), pendingCount: patientPending.length,
      hasPending: patientPending.length > 0,
      maxOverdueDays: patientPending.reduce((maximum, item) => Math.max(maximum, item.overdueDays || 0), 0),
    };
  });
  const wardOrder = workspace.settings && workspace.settings.departmentWards
    ? workspace.settings.departmentWards[activeDepartment] || []
    : [];
  patients.sort((a, b) => compareMedicalRecordPatients(a, b, wardOrder));

  const pending = [...pendingRequirements.values()];
  return {
    referenceDate, department: activeDepartment, podColumns, patients,
    summary: {
      pending: pending.length,
      severe: pending.filter((item) => item.status === 'severe').length,
      overdue: pending.filter((item) => ['warning', 'overdue', 'severe'].includes(item.status)).length,
      today: todayRequirements.size,
      dischargeWindow: dischargeWindowRequirements.size,
    },
  };
}

export function setMedicalRecordRequirementDone(patientId, requirementKey, done, referenceDate = todayKey()) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!patient) return { ok: false, error: '未找到患者' };
  const board = getMedicalRecordBoard(referenceDate, workspace, patient.department);
  const row = board.patients.find((item) => item.id === patientId);
  if (!row) return { ok: false, error: '该患者当前没有可核对的病历节点' };
  const requirement = [...row.podCells, row.dischargeCell].find((item) => item.requirementKey === requirementKey);
  if (!requirement) return { ok: false, error: '病历节点已变化，请刷新后重新核对' };
  if (done && !requirement.done && !requirement.actionable) return { ok: false, error: '未来病历节点不能提前完成' };
  workspace.medicalRecordCompletions = (workspace.medicalRecordCompletions || []).filter((item) => !(item.patientId === patientId && item.requirementKey === requirementKey));
  let completion = null;
  if (done) {
    completion = normalizeMedicalRecordCompletion({
      patientId, requirementKey, kind: requirement.kind, pod: requirement.pod,
      dueDate: requirement.dueDate, surgeryDate: patient.surgeryDate,
      dischargeDate: requirement.dischargeDate || '', completedAt: new Date().toISOString(),
    });
    workspace.medicalRecordCompletions.unshift(completion);
  }
  saveWorkspace(workspace);
  const refreshedRow = getMedicalRecordBoard(referenceDate, workspace, patient.department).patients.find((item) => item.id === patientId);
  const stillSatisfied = Boolean(!done && requirement.kind === 'discharge' && refreshedRow && refreshedRow.dischargeCell.done);
  return {
    ok: true,
    done: Boolean(done),
    completion,
    linkedDischarge: row.dischargeCell.requirementKey === requirementKey && row.dischargeCell.linkedPod !== null,
    stillSatisfied,
    remainingLinkedPod: stillSatisfied ? refreshedRow.dischargeCell.linkedPod : null,
  };
}

// User-visible status is derived only from factual dates; legacy workflow stages are ignored.
export function getPatientStatus(patient, referenceDate = todayKey()) {
  if (!patient) return '在院';
  if (hasActualDischarge(patient)) return '已出院';
  if (patient.admissionState === 'planned' || isPreAdmission(patient, referenceDate)) return '待入院';
  return '在院';
}

// A future admission date represents a planned admission. This is derived at
// display time so it automatically becomes an in-hospital patient on that day.
export function isPreAdmission(patient, referenceDate = todayKey()) {
  if (!patient || hasActualDischarge(patient)) return false;
  if (patient.admissionState === 'planned') return true;
  if (patient.admissionState === 'admitted') return false;
  return Boolean(patient.admissionDate && validDateKey(`${patient.admissionDate}`) && patient.admissionDate > referenceDate);
}

export function isPostoperative(patient, referenceDate = todayKey()) {
  return Boolean(patient && ((validDateKey(`${patient.surgeryDate || ''}`) && patient.surgeryDate <= referenceDate) || hasActualDischarge(patient)));
}

// Drain placement and measurement are available from the operation day onward,
// even when a legacy/manual workflow stage has not yet been advanced.
export function isDrainPeriod(patient, referenceDate = todayKey()) {
  return isIntraoperativeOrLater(patient, referenceDate);
}

export function isIntraoperativeOrLater(patient, referenceDate = todayKey()) {
  return isPostoperative(patient, referenceDate);
}

export function getEffectiveConditions(patient, suppliedWorkspace) {
  const workspace = suppliedWorkspace || getWorkspace();
  const conditions = new Set(patient.conditions || []);
  if (workspace.devices.some((device) => device.patientId === patient.id && device.type === 'drain' && device.status === 'active')) conditions.add('有引流');
  return Array.from(conditions);
}

export function addRoundActionTemplate(title) {
  const value = `${title || ''}`.trim();
  if (!value) return false;
  const workspace = getWorkspace();
  if (workspace.settings.roundActionTemplates.some((item) => item.title === value)) return false;
  workspace.settings.roundActionTemplates.push({ id: uniqueId('round-action'), title: value, category: '查房', priority: '普通', effect: null });
  saveWorkspace(workspace);
  return true;
}

export function removeRoundActionTemplate(id) {
  const workspace = getWorkspace();
  const before = workspace.settings.roundActionTemplates.length;
  workspace.settings.roundActionTemplates = workspace.settings.roundActionTemplates.filter((item) => item.id !== id);
  if (workspace.settings.roundActionTemplates.length === before) return false;
  saveWorkspace(workspace);
  return true;
}

export function addRoundActionTask(patientId, actionId) {
  const workspace = getWorkspace();
  const action = workspace.settings.roundActionTemplates.find((item) => item.id === actionId);
  if (!action) return { ok: false, error: '未找到快捷操作' };
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (action.postoperativeOnly && !isPostoperative(patient)) return { ok: false, error: '该操作仅在术后可用' };
  return addTask(patientId, {
    title: action.title, category: action.category, priority: action.priority, effect: action.effect,
    dueAt: todayKey(), source: '查房快捷操作', sourceRef: `round-action:${action.id}:${todayKey()}`,
  });
}

export function addDrain(patientId, name) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  if (!patient) return { ok: false, error: '未找到在院患者' };
  if (!isDrainPeriod(patient)) return { ok: false, error: '手术当日或术后才能添加引流' };
  const existingNames = new Set(workspace.devices.filter((item) => item.patientId === patientId && item.type === 'drain').map((item) => `${item.name || ''}`.trim().toLocaleLowerCase()).filter(Boolean));
  const requestedName = `${name || ''}`.trim();
  let deviceName = requestedName;
  if (!deviceName) {
    let number = 1;
    do { deviceName = `引流 ${number}`; number += 1; } while (existingNames.has(deviceName.toLocaleLowerCase()));
  }
  if (existingNames.has(deviceName.toLocaleLowerCase())) return { ok: false, error: '同一患者的引流名称不能重复' };
  const device = normalizeDevice({ patientId, name: deviceName });
  workspace.devices.push(device);
  saveWorkspace(workspace);
  return { ok: true, device };
}

export function ensureDrainRowCount(patientId, count) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  const nextCount = Math.max(0, Number(count) || 0);
  if (!patient) return { ok: false, error: '未找到在院患者' };
  if (!isDrainPeriod(patient)) return { ok: false, error: '进入手术阶段后才能添加 POD 行' };
  if (nextCount <= (patient.drainRowCount || 0)) return { ok: true, rowCount: patient.drainRowCount || 0 };
  patient.drainRowCount = nextCount;
  patient.updatedAt = new Date().toISOString();
  saveWorkspace(workspace);
  return { ok: true, rowCount: nextCount };
}

export function recordDrainVolume(patientId, deviceId, value, pod, { confirmWarning = false } = {}) {
  const textValue = `${value || ''}`.trim();
  const podNumber = Number(pod);
  if (!Number.isInteger(podNumber) || podNumber < 1) return { ok: false, error: '请选择有效的 POD 次数' };
  if (textValue !== '拔' && !/^\d+(\.\d)?$/.test(textValue)) return { ok: false, error: '请输入非负数字（最多一位小数）或“拔”' };
  const number = textValue === '拔' ? null : Number(textValue);
  if (textValue !== '拔' && (!Number.isFinite(number) || number < 0)) return { ok: false, error: '请输入有效的非负引流量' };
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  const device = workspace.devices.find((item) => item.id === deviceId && item.patientId === patientId && item.type === 'drain');
  if (!patient || !device) return { ok: false, error: '未找到引流项目' };
  if (!isDrainPeriod(patient) && !device.legacy) return { ok: false, error: '手术当日或术后才能记录引流量' };
  const deviceEntries = workspace.observations.filter((item) => item.deviceId === deviceId).sort((a, b) => a.pod - b.pod);
  const removal = deviceEntries.find((item) => item.entryType === 'removed');
  if (device.status !== 'active' && (!removal || podNumber > removal.pod)) return { ok: false, error: `该引流已在 POD ${removal ? removal.pod : '?'} 拔除，仅可更正拔管当日或此前记录` };
  if (textValue !== '拔' && removal && podNumber > removal.pod) return { ok: false, error: `该引流已在 POD ${removal.pod} 拔除，仅可更正拔管当日或此前记录` };
  const recent = deviceEntries.filter((item) => item.entryType === 'volume' && item.pod < podNumber).slice(-1)[0];
  const warning = textValue === '拔' ? '' : number > 10000 ? '引流量超过 10000 mL，请立即核对记录和单位' : recent && recent.value > 0 && number >= recent.value * 3 ? '引流量较前次明显升高，请核对记录和单位' : '';
  if (warning && !confirmWarning) return { ok: false, requiresWarningConfirmation: true, warning };
  if (textValue === '拔') workspace.observations = workspace.observations.filter((item) => item.deviceId !== deviceId || item.entryType !== 'removed' || item.pod === podNumber);
  const observation = normalizeObservation({ patientId, deviceId, value: number, entryType: textValue === '拔' ? 'removed' : 'volume', pod: podNumber });
  const existingIndex = workspace.observations.findIndex((item) => item.deviceId === deviceId && item.pod === podNumber);
  if (existingIndex >= 0) workspace.observations[existingIndex] = observation;
  else workspace.observations.push(observation);
  const removalRecord = workspace.observations.find((item) => item.deviceId === deviceId && item.entryType === 'removed');
  device.status = removalRecord ? 'removed' : 'active';
  device.removedAt = removalRecord ? new Date().toISOString() : '';
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: 'drain-status', value: device.status, note: `${device.name} · POD ${podNumber}` }));
  saveWorkspace(workspace);
  return { ok: true, observation, warning };
}

// 只允许移除尚未产生记录的误加列；已有记录请以“拔”结束，避免删除病程证据。
export function removeDrain(patientId, deviceId) {
  const workspace = getWorkspace();
  const patient = workspace.patients.find((item) => item.id === patientId);
  const device = workspace.devices.find((item) => item.id === deviceId && item.patientId === patientId && item.type === 'drain');
  if (!patient || !device) return { ok: false, error: '未找到引流项目' };
  if (workspace.observations.some((item) => item.deviceId === deviceId)) return { ok: false, error: '该引流已有记录，不能删除；请记录“拔”结束引流' };
  workspace.devices = workspace.devices.filter((item) => item.id !== deviceId);
  saveWorkspace(workspace);
  return { ok: true };
}

export function setDrainStatus(patientId, deviceId, status) {
  const workspace = getWorkspace();
  const device = workspace.devices.find((item) => item.id === deviceId && item.patientId === patientId && item.type === 'drain');
  if (!device) return false;
  device.status = status === 'removed' ? 'removed' : 'active';
  device.removedAt = device.status === 'removed' ? new Date().toISOString() : '';
  workspace.clinicalEvents.push(normalizeClinicalEvent({ patientId, type: 'drain-status', value: device.status, note: device.name }));
  saveWorkspace(workspace);
  return true;
}

export function addClinicalEvent(patientId, type, note) {
  const value = `${note || ''}`.trim();
  if (!value) return { ok: false, error: '请填写记录内容' };
  const workspace = getWorkspace();
  if (!workspace.patients.some((item) => item.id === patientId)) return { ok: false, error: '未找到在院患者' };
  const event = normalizeClinicalEvent({ patientId, type, value });
  workspace.clinicalEvents.push(event);
  saveWorkspace(workspace);
  return { ok: true, event };
}

export function taskBucket(task, referenceDate = todayKey()) {
  const due = `${task.dueAt || referenceDate}`.slice(0, 10);
  if (due < referenceDate) return 'overdue';
  if (due === referenceDate) return 'today';
  return 'upcoming';
}

export function getActiveTasks() {
  const workspace = getWorkspace();
  const activeIds = new Set(workspace.patients.filter((item) => !hasActualDischarge(item)).map((item) => item.id));
  return workspace.tasks.filter((item) => activeIds.has(item.patientId) && item.status !== 'done' && !legacyWorkflowTask(item));
}

export function getPatientLocation(patient, departmentWards = {}) {
  const bed = numericOnly(patient && patient.bed);
  const wards = getDepartmentWards(patient && patient.department, { departmentWards });
  const hasMultipleWards = wards.length > 1;
  const requestedWard = `${(patient && patient.ward) || ''}`.trim();
  const ward = requestedWard && wards.includes(requestedWard) ? requestedWard : '';
  const effectiveWard = ward || (!hasMultipleWards ? wards[0] || '' : '');
  if (!effectiveWard && !bed) return '病房及床位待分配';
  if (!effectiveWard) return `病房待分配 · ${bed}床`;
  if (!bed) return hasMultipleWards ? `${effectiveWard} · 床位待分配` : '床位待分配';
  return hasMultipleWards ? `${effectiveWard} · ${bed}床` : `${bed}床`;
}

export function maskPatient(patient, departmentWards = {}) {
  if (!patient) return patient;
  const rawName = patient.name || '';
  const rawId = patient.id || '';
  // Two-character Chinese names must not reveal both characters after masking.
  const name = rawName.length >= 3 ? `${rawName.slice(0, 1)}*${rawName.slice(-1)}` : rawName.length === 2 ? `${rawName.slice(0, 1)}*` : rawName || '未命名';
  const id = rawId.length > 4 ? `${rawId.slice(0, 2)}****${rawId.slice(-2)}` : rawId;
  const gender = inferGender(patient);
  const genderClass = gender === '女' ? 'female' : gender === '男' ? 'male' : '';
  const patientType = PLASTIC_PATIENT_TYPES.includes(patient.patientType) ? patient.patientType : '待选择';
  const patientTypeClass = patientType === '国疗' ? 'type-national' : patientType === '日间' ? 'type-day' : patientType === '普通' ? 'type-general' : '';
  const bed = numericOnly(patient.bed);
  const locationLabel = getPatientLocation(patient, departmentWards);
  const needsReview = Boolean(
    patient.admissionStateNeedsReview || !`${patient.id || ''}`.trim() || !`${patient.name || ''}`.trim()
    || !['男', '女'].includes(gender) || !PLASTIC_PATIENT_TYPES.includes(patient.patientType)
    || !`${patient.department || ''}`.trim() || !['planned', 'admitted'].includes(patient.admissionState)
    || (patient.admissionState === 'admitted' && !bed) || !`${patient.surgeon || ''}`.trim()
  );
  return { ...patient, bed, bedDisplay: locationLabel, locationLabel, gender, genderClass, patientType, patientTypeClass, needsReview, careStatus: getPatientStatus(patient), displayName: name, displayId: id, ageSex: formatAgeSex(inferAge(patient), gender) };
}

export function workspaceStorageKeys() {
  return { current: STORAGE_KEY, previous: PREVIOUS_STORAGE_KEY, legacy: LEGACY_STORAGE_KEY, migrationSnapshot: MIGRATION_SNAPSHOT_KEY, v4MigrationSnapshot: V4_MIGRATION_SNAPSHOT_KEY, preopMigrationSnapshot: PREOP_MIGRATION_SNAPSHOT_KEY, medicalRecordMigrationSnapshot: MEDICAL_RECORD_MIGRATION_SNAPSHOT_KEY, restoreSnapshot: RESTORE_SNAPSHOT_KEY };
}
