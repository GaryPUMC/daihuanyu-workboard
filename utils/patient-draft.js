export const PATIENT_TYPES = ['普通', '国疗', '日间'];
export const ADMISSION_STATES = ['planned', 'admitted'];

const FIELD_ORDER = [
  'id', 'name', 'gender', 'patientType', 'department', 'ward', 'admissionState', 'admissionDate', 'bed',
  'surgeon', 'allergyStatus', 'allergies', 'surgeryDate', 'plannedDischargeDate', 'actualDischargeDate',
];

function text(value) {
  return value === undefined || value === null ? '' : `${value}`.trim();
}

function numericText(value) {
  const source = text(value);
  const match = source.match(/\d+/);
  return match ? match[0] : '';
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getDraftDepartmentWards(department, departmentWards = {}) {
  const name = text(department);
  const configured = name && Array.isArray(departmentWards[name])
    ? Array.from(new Set(departmentWards[name].map(text).filter(Boolean)))
    : [];
  return configured.length ? configured : (name ? [name] : []);
}

function uniqueMatchingWard(wards, pattern) {
  const matches = wards.filter((ward) => pattern.test(ward));
  return matches.length === 1 ? matches[0] : '';
}

export function defaultWardForDraft(patientType, wards) {
  if (!Array.isArray(wards) || !wards.length) return '';
  if (wards.length === 1) return wards[0];
  if (patientType === '日间') return uniqueMatchingWard(wards, /日间/);
  if (patientType === '普通') return uniqueMatchingWard(wards, /普通/);
  return '';
}

export function preparePatientDraft(source = {}, context = {}) {
  const rawDepartment = text(source.department);
  const patientType = PATIENT_TYPES.includes(text(source.patientType)) ? text(source.patientType) : '';
  // 国疗患者缺科室时必须人工选择；其他患者可使用当前工作科室。
  const department = rawDepartment || (patientType === '国疗' ? '' : text(context.activeDepartment));
  const wards = getDraftDepartmentWards(department, context.departmentWards);
  const rawWard = text(source.ward);
  const ward = rawWard || defaultWardForDraft(patientType, wards);
  const allergyStatus = ['unknown', 'none', 'present'].includes(text(source.allergyStatus))
    ? text(source.allergyStatus)
    : (text(source.allergies) ? 'present' : 'unknown');
  const explicitAdmissionState = text(source.admissionState);
  const admissionState = ADMISSION_STATES.includes(explicitAdmissionState) ? explicitAdmissionState : '';
  const admissionDate = text(source.admissionDate || (admissionState === 'planned' ? source.plannedAdmissionDate : source.actualAdmissionDate));
  const rawSurgeryDate = text(source.surgeryDate);
  const rawPlannedDischargeDate = text(source.plannedDischargeDate || source.dischargeDate);
  // 日间患者的三个计划日期是同一业务日期。界面会将手术和计划出院
  // 显示为“入院同日”，因此草稿值也必须同步，避免出现“看似已填、校验仍为空”。
  // 只补空值：结构化导入若明确给出冲突日期，后续校验仍会阻断并要求人工核对。
  const dayAdmissionDate = patientType === '日间' && validDate(admissionDate) ? admissionDate : '';
  const surgeryDate = rawSurgeryDate || dayAdmissionDate;
  const plannedDischargeDate = rawPlannedDischargeDate || dayAdmissionDate;
  const value = {
    ...source,
    id: text(source.id),
    name: text(source.name),
    bed: numericText(source.bed),
    age: numericText(source.age),
    gender: text(source.gender),
    patientType,
    department,
    ward,
    admissionState,
    admissionDate,
    diagnosis: text(source.diagnosis),
    allergyStatus,
    allergies: allergyStatus === 'none' ? '' : text(source.allergies),
    surgeryDate,
    plannedDischargeDate,
    actualDischargeDate: text(source.actualDischargeDate),
    surgeryName: text(source.surgeryName),
    surgeon: text(source.surgeon),
    firstAssistant: text(source.firstAssistant),
  };
  const defaultedFields = {};
  if (!rawDepartment && department) defaultedFields.department = `已使用当前科室“${department}”`;
  if (!rawWard && ward) defaultedFields.ward = `已按患者类型使用“${ward}”`;
  if (!rawSurgeryDate && surgeryDate) defaultedFields.surgeryDate = '日间患者手术日期已按入院日期同步';
  if (!rawPlannedDischargeDate && plannedDischargeDate) defaultedFields.plannedDischargeDate = '日间患者计划出院日期已按入院日期同步';
  return { value, wards, defaultedFields };
}

function addError(fieldErrors, key, message) {
  if (!fieldErrors[key]) fieldErrors[key] = message;
}

export function validatePatientDraft(source = {}, context = {}) {
  const prepared = preparePatientDraft(source, context);
  const patient = prepared.value;
  const fieldErrors = {};
  const warnings = [];

  if (!patient.id) addError(fieldErrors, 'id', '请填写住院号或病案号');
  if (!patient.name) addError(fieldErrors, 'name', '请填写姓名');
  if (!['男', '女'].includes(patient.gender)) addError(fieldErrors, 'gender', '请选择性别');
  if (!PATIENT_TYPES.includes(patient.patientType)) addError(fieldErrors, 'patientType', '请选择患者类型');
  if (!patient.department) addError(fieldErrors, 'department', patient.patientType === '国疗' ? '国疗患者必须手动选择科室' : '请选择科室');
  if (patient.department && Array.isArray(context.departments) && !context.departments.includes(patient.department)) {
    addError(fieldErrors, 'department', `科室“${patient.department}”不在当前设置中`);
  }
  if (prepared.wards.length > 1 && !patient.ward) {
    addError(fieldErrors, 'ward', patient.patientType === '国疗' ? '国疗患者必须手动选择病房' : '该科室有多个病房，请手动选择病房');
  }
  if (patient.ward && !prepared.wards.includes(patient.ward)) addError(fieldErrors, 'ward', `病房“${patient.ward}”不在所选科室中`);
  if (!ADMISSION_STATES.includes(patient.admissionState)) addError(fieldErrors, 'admissionState', '请选择待入院或已入院');
  if (!patient.admissionDate) addError(fieldErrors, 'admissionDate', '请选择入院日期');
  else if (!validDate(patient.admissionDate)) addError(fieldErrors, 'admissionDate', '入院日期格式无效');
  if (patient.admissionState === 'admitted' && !patient.bed) addError(fieldErrors, 'bed', '已入院患者必须填写床位');
  if (!patient.surgeon) addError(fieldErrors, 'surgeon', '请填写主刀医生');
  if (patient.allergyStatus === 'present' && !patient.allergies) addError(fieldErrors, 'allergies', '过敏史标记为“有”时必须填写详情');

  [['surgeryDate', '手术日期'], ['plannedDischargeDate', '计划出院日期'], ['actualDischargeDate', '实际出院日期']].forEach(([key, label]) => {
    if (patient[key] && !validDate(patient[key])) addError(fieldErrors, key, `${label}格式无效`);
  });
  if (patient.admissionState === 'admitted' && patient.admissionDate && validDate(patient.admissionDate) && context.today && patient.admissionDate > context.today) {
    addError(fieldErrors, 'admissionDate', '已入院患者的入院日期不能晚于今天');
  }
  if (patient.admissionDate && patient.surgeryDate && patient.admissionDate > patient.surgeryDate) addError(fieldErrors, 'surgeryDate', '手术日期不能早于入院日期');
  if (patient.surgeryDate && patient.plannedDischargeDate && patient.surgeryDate > patient.plannedDischargeDate) addError(fieldErrors, 'plannedDischargeDate', '计划出院日期不能早于手术日期');
  if (!patient.surgeryDate && patient.admissionDate && patient.plannedDischargeDate && patient.admissionDate > patient.plannedDischargeDate) addError(fieldErrors, 'plannedDischargeDate', '计划出院日期不能早于入院日期');
  if (patient.admissionDate && patient.actualDischargeDate && patient.admissionDate > patient.actualDischargeDate) addError(fieldErrors, 'actualDischargeDate', '实际出院日期不能早于入院日期');
  if (patient.admissionState === 'planned' && patient.actualDischargeDate) addError(fieldErrors, 'admissionState', '已有实际出院日期的患者不能标记为待入院');
  if (patient.patientType === '日间') {
    if (!patient.surgeryDate) addError(fieldErrors, 'surgeryDate', '日间患者必须填写手术日期');
    if (!patient.plannedDischargeDate) addError(fieldErrors, 'plannedDischargeDate', '日间患者必须填写计划出院日期');
    if (patient.admissionDate && patient.surgeryDate && patient.admissionDate !== patient.surgeryDate) addError(fieldErrors, 'surgeryDate', '日间患者的入院与手术日期必须同日');
    if (patient.admissionDate && patient.plannedDischargeDate && patient.admissionDate !== patient.plannedDischargeDate) addError(fieldErrors, 'plannedDischargeDate', '日间患者的入院与计划出院日期必须同日');
  }

  const existingIds = new Set((context.existingPatients || []).map((item) => text(item.id)).filter(Boolean));
  const originalId = text(context.originalPatientId);
  if (patient.id && existingIds.has(patient.id) && patient.id !== originalId) addError(fieldErrors, 'id', '该住院号已存在，请搜索核对');

  Object.values(prepared.defaultedFields).forEach((message) => warnings.push(message));
  const incompleteFields = FIELD_ORDER.filter((key) => fieldErrors[key]);
  return {
    ok: incompleteFields.length === 0,
    value: patient,
    fieldErrors,
    incompleteFields,
    firstErrorField: incompleteFields[0] || '',
    errors: incompleteFields.map((key) => fieldErrors[key]),
    warnings,
    defaultedFields: prepared.defaultedFields,
    wardOptions: prepared.wards,
  };
}

export function patientDraftErrorText(result) {
  return result && Array.isArray(result.errors) ? result.errors.join('；') : '';
}
