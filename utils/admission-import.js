import { patientDraftErrorText, validatePatientDraft } from './patient-draft';

export const ADMISSION_IMPORT_SCHEMA = 'workboard-admission-import/v1';

export const ADMISSION_IMPORT_GUIDE = `入院资料整理要求：请仅从提供的材料中提取拟入院或已入院患者信息；其他信息不得猜测、补全、推断或给出诊疗建议。

本次处理日期：{{TODAY_BEIJING}}（北京时间）。“今日”仅指该日期；“当月”仅指该日期所在月份。

请只返回合法 JSON，不要使用 Markdown 代码块，不要添加解释文字。JSON 的所有键名和字符串边界必须使用英文半角双引号（"），不得使用中文引号“”或其他全角引号。返回结构必须严格如下：
{
  "schema": "workboard-admission-import/v1",
  "department": "科室名称",
  "patients": [
    {
      "id": "住院号或病案号",
      "name": "姓名",
      "ward": "病房名称；单病房科室可为空字符串",
      "bed": "床位数字；预入院且未分配床位时为空字符串",
      "age": "年龄数字或空字符串",
      "gender": "男或女",
      "admissionState": "planned 或 admitted；无法确认则空字符串",
      "admissionDate": "YYYY-MM-DD",
      "surgeon": "主刀医生",
      "firstAssistant": "一助医生或空字符串",
      "patientType": "普通、国疗、日间之一；无法确定则空字符串",
      "diagnosis": "诊断简称或空字符串",
      "allergyStatus": "unknown、none、present 之一；无法确认则 unknown",
      "allergies": "过敏史或空字符串",
      "surgeryDate": "YYYY-MM-DD 或空字符串",
      "plannedDischargeDate": "YYYY-MM-DD 或空字符串",
      "surgeryName": "拟行术式或空字符串",
      "managedByDaihuanyu": true
    }
  ]
}

规则：
1. 仅保留明确由“代寰宇”负责管理、且可确认有入院日期的患者；主刀医生可以是其他医生，surgeon 必须如实填写。每位保留的患者都必须返回 managedByDaihuanyu: true。
2. 若材料明确写有“X术”（X 为 1 至 31 的有效日号），可将 surgeryDate 填为本次处理日期所在月份的 X 日；不得推断跨月、跨年或不存在的日期。除这项规则外，其他信息不得猜测。
3. admissionState 仅在材料明确表示尚未入院/拟入院时填 planned，明确表示已经入院时填 admitted；无法确认时必须为空字符串。不得只根据日期推断入院状态。
4. 对已纳入患者，id、name、gender、admissionDate、surgeon 缺失时保留空字符串，不得编造；多病房科室必须如实填写 ward，单病房科室可留空；待入院患者未分配床位时 bed 必须保留空字符串，不得填写 999 或其他占位床号。其他不明确字段也保留空字符串，供人工补充。
5. 未提供手术日期、计划出院日期或术式时必须为空字符串；尤其不得默认“明日手术”。
6. department 必须使用材料中的名称；没有明确科室时返回空字符串。
7. 不得输出身份证号、手机号、住址、完整病历、治疗建议或任何未列出的字段。`;

export function getAdmissionImportGuide(today) {
  return ADMISSION_IMPORT_GUIDE.replace('{{TODAY_BEIJING}}', text(today) || 'YYYY-MM-DD');
}

function text(value) {
  return value === undefined || value === null ? '' : `${value}`.trim();
}

function dateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function removeCodeFence(value) {
  const source = text(value).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : source;
}

function candidateStatus(candidate) {
  if (candidate.errors.length) return { label: '不可导入', tone: 'blocked' };
  if (candidate.warnings.length) return { label: '可导入，请核对', tone: 'warning' };
  return { label: '可导入', tone: 'ready' };
}

function normalizeCandidate(raw, index, options, existingIds, importIds, defaultDepartment) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = validatePatientDraft(source, {
    today: options.today,
    activeDepartment: defaultDepartment,
    departments: options.departments,
    departmentWards: options.departmentWards,
    existingPatients: Array.from(existingIds, (id) => ({ id })),
  });
  const patient = { ...result.value, managedByDaihuanyu: source.managedByDaihuanyu === true };
  const fieldErrors = { ...result.fieldErrors };
  if (!patient.managedByDaihuanyu) fieldErrors.managedByDaihuanyu = '仅纳入明确由代寰宇负责管理的患者';
  if (text(source.bed) && !patient.bed) fieldErrors.bed = '床位必须包含数字';
  if (patient.id && importIds.has(patient.id)) fieldErrors.id = '本次文本中存在重复住院号';
  if (patient.id) importIds.add(patient.id);
  const errors = Object.values(fieldErrors);
  const warnings = [...result.warnings];
  const isPreAdmission = patient.admissionState === 'planned';
  if (!patient.bed && isPreAdmission) warnings.push('待入院患者尚未分配床位，保存后将显示“待分配”');
  const status = candidateStatus({ errors, warnings });
  return {
    candidateId: `admission-candidate-${Date.now()}-${index}`,
    index: index + 1,
    patient,
    isPreAdmission,
    admissionLabel: patient.admissionState === 'planned' ? '待入院' : patient.admissionState === 'admitted' ? '已入院' : '入院状态待核实',
    wardOptions: result.wardOptions,
    locationLabel: result.wardOptions.length > 1 && patient.ward ? (patient.bed ? `${patient.ward} · ${patient.bed}床` : `${patient.ward} · 待分配`) : (patient.bed ? `${patient.bed}床` : '待分配'),
    errors,
    warnings,
    fieldErrors,
    incompleteFields: Object.keys(fieldErrors),
    firstErrorField: result.firstErrorField || Object.keys(fieldErrors)[0] || '',
    defaultedFields: result.defaultedFields,
    bedDisplay: result.wardOptions.length > 1 && patient.ward ? (patient.bed ? `${patient.ward} · ${patient.bed}床` : `${patient.ward} · 待分配`) : (patient.bed ? `${patient.bed}床` : '待分配'),
    errorText: patientDraftErrorText({ errors }),
    warningText: warnings.join('；'),
    statusLabel: status.label,
    statusTone: status.tone,
    selected: errors.length === 0,
  };
}

export function parseAdmissionImport(textValue, options = {}) {
  const today = text(options.today);
  const activeDepartment = text(options.activeDepartment);
  const departments = Array.isArray(options.departments) ? options.departments : [];
  const departmentWards = options.departmentWards && typeof options.departmentWards === 'object' ? options.departmentWards : {};
  if (!today || !dateValid(today)) return { ok: false, error: '缺少有效的今日日期', candidates: [] };
  if (!activeDepartment) return { ok: false, error: '请先选择当前工作科室', candidates: [] };
  let parsed;
  try {
    parsed = JSON.parse(removeCodeFence(textValue));
  } catch (error) {
    return { ok: false, error: '无法识别 JSON，请按“复制整理格式”准备完整结构化文本', candidates: [] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: '导入文本必须是一个 JSON 对象', candidates: [] };
  if (parsed.schema !== ADMISSION_IMPORT_SCHEMA) return { ok: false, error: `schema 必须为 ${ADMISSION_IMPORT_SCHEMA}`, candidates: [] };
  if (!Array.isArray(parsed.patients) || !parsed.patients.length) return { ok: false, error: 'patients 必须至少包含一位患者', candidates: [] };
  const defaultDepartment = text(parsed.department) || activeDepartment;
  const existingIds = new Set((options.existingPatients || []).map((item) => text(item.id)).filter(Boolean));
  const importIds = new Set();
  const candidates = parsed.patients.map((item, index) => normalizeCandidate(item, index, { today, departments, departmentWards }, existingIds, importIds, defaultDepartment));
  return {
    ok: true,
    candidates,
    summary: {
      total: candidates.length,
      ready: candidates.filter((item) => !item.errors.length).length,
      blocked: candidates.filter((item) => item.errors.length).length,
    },
  };
}

export function buildAdmissionPatient(candidate, today) {
  const patient = candidate.patient;
  return { ...patient };
}
