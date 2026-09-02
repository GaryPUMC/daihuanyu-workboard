import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));
const app = read('../app.json');
const store = read('../utils/workspace-store.js');
const validator = read('../utils/patient-draft.js');
const admissionUtil = read('../utils/admission-import.js');
const admissionJs = read('../pages/admission-import/admission-import.js');
const admissionWxml = read('../pages/admission-import/admission-import.wxml');
const candidateJs = read('../pages/admission-candidate-edit/admission-candidate-edit.js');
const candidateWxml = read('../pages/admission-candidate-edit/admission-candidate-edit.wxml');
const patientsJs = read('../pages/patients/patients.js');
const patientsWxml = read('../pages/patients/patients.wxml');
const detailJs = read('../pages/patient-detail/patient-detail.js');
const detailWxml = read('../pages/patient-detail/patient-detail.wxml');
const home = read('../pages/home/home.wxml');

assert.equal(read('../VERSION').split(/\r?\n/)[0].trim(), '1.2.1');
assert.equal(store.includes('const SCHEMA_VERSION = 11'), true);
assert.equal(app.includes('pages/admission-candidate-edit/admission-candidate-edit'), true);
['../pages/admission-candidate-edit/admission-candidate-edit.js', '../pages/admission-candidate-edit/admission-candidate-edit.wxml', '../pages/admission-candidate-edit/admission-candidate-edit.wxss', '../pages/admission-candidate-edit/admission-candidate-edit.json'].forEach((path) => assert.equal(exists(path), true));

// 统一入口：AI、手工新增、详情编辑和底层保存必须共用同一校验器。
[admissionUtil, candidateJs, patientsJs, detailJs, store].forEach((source) => assert.equal(source.includes('validatePatientDraft'), true));
assert.equal(store.includes('export function createPatient'), true);
assert.equal(store.includes('export function createPatientsAtomically'), true);
assert.equal(store.includes('export function updatePatient'), true);

// 未知信息不猜测；国疗科室人工选择；普通/日间病房只做可确定默认。
assert.equal(validator.includes("PATIENT_TYPES.includes(text(source.patientType)) ? text(source.patientType) : ''"), true);
assert.equal(validator.includes("patientType === '国疗' ? ''"), true);
assert.equal(validator.includes("patientType === '日间'"), true);
assert.equal(validator.includes('/日间/'), true);
assert.equal(validator.includes('/普通/'), true);
assert.equal(validator.includes("ADMISSION_STATES.includes(explicitAdmissionState) ? explicitAdmissionState : ''"), true);
assert.equal(validator.includes("patient.admissionState === 'admitted' && !patient.bed"), true);

// AI 编辑改为完整页面，避免底部弹层/键盘遮挡，并提供字段级高亮和清空日期。
assert.equal(admissionWxml.includes('<wb-sheet'), false);
assert.equal(admissionJs.includes('wx.navigateTo'), true);
assert.equal(admissionJs.includes('eventChannel'), true);
['formErrors.patientType', 'formErrors.admissionState', 'formErrors.department', 'formErrors.ward', 'formErrors.bed'].forEach((text) => assert.equal(candidateWxml.includes(text), true));
assert.equal(candidateWxml.includes('信息未完整'), true);
assert.equal(candidateWxml.includes('clearDate'), true);
assert.equal(candidateJs.includes('validatePatientDraft'), true);

// 手工新增与详情编辑同样展示高亮，旧数据在列表和详情显示待补全提示。
assert.equal(patientsWxml.includes('资料待补全'), true);
assert.equal(patientsWxml.includes('formErrors.admissionState'), true);
assert.equal(detailWxml.includes('资料未完整'), true);
assert.equal(detailWxml.includes('editErrors.admissionState'), true);
assert.equal(detailJs.includes('clearEditDate'), true);

// 继续保留既有事实状态与隐私边界（出院后待归档）。
assert.equal(home.includes('出院后待归档'), true);
assert.equal(read('../PROJECT.md').includes('本小程序不提供AI服务'), true);
const changelog = read('../releases/1.2.1/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('本小程序不提供AI服务'), true);
assert.equal(exists('../releases/1.2.1/source.tar.gz'), true);

console.log('1.2.1 shared patient validation and full-page AI correction checks: passed');
