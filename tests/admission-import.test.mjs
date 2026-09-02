import assert from 'node:assert/strict';
import fs from 'node:fs';

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const sourcePath = new URL('../utils/admission-import.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const importer = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const today = '2026-08-09';
const options = { today, activeDepartment: '整形外科', departments: ['整形外科', '骨科'], existingPatients: [{ id: 'EXISTS-001' }] };

const prompt = importer.getAdmissionImportPrompt(today);
assert.match(prompt, /本次处理日期：2026-08-09（北京时间）/);
assert.match(prompt, /无法确认时必须为空字符串/);
assert.match(prompt, /不得只根据日期推断入院状态/);
assert.match(prompt, /待入院患者未分配床位时/);
assert.match(prompt, /admissionState/);
assert.match(prompt, /若材料明确写有“X术”/);
assert.match(prompt, /不得使用中文引号/);

const valid = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA,
  department: '整形外科',
  patients: [{ id: 'NEW-001', name: '测试患者', bed: '12', age: '32', gender: '女', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', firstAssistant: '', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), options);
assert.equal(valid.ok, true);
assert.equal(valid.summary.ready, 1);
assert.equal(valid.candidates[0].patient.department, '整形外科');
assert.equal(valid.candidates[0].patient.allergyStatus, 'unknown');
assert.equal('stage' in importer.buildAdmissionPatient(valid.candidates[0], today), false);

const chineseQuotes = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'NEW-003', name: '测试患者', bed: '13', age: '', gender: '男', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', firstAssistant: '', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}).replace(/"/g, '“'), options);
assert.equal(chineseQuotes.ok, true);

const blocked = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA,
  patients: [{ id: 'EXISTS-001', name: '测试患者', bed: '3床', age: '', gender: '女', admissionState: 'admitted', admissionDate: '2026-08-08', surgeon: '', patientType: '', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '' }],
}), options);
assert.equal(blocked.ok, true);
assert.equal(blocked.summary.blocked, 1);
assert.match(blocked.candidates[0].errorText, /已存在/);
assert.match(blocked.candidates[0].errorText, /请填写主刀医生/);
assert.equal(blocked.candidates[0].patient.bed, '3');

const corrected = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA,
  department: '整形外科',
  patients: [{ ...blocked.candidates[0].patient, id: 'NEW-002', patientType: '普通', admissionDate: today, surgeon: '补充主刀', managedByDaihuanyu: true }],
}), options);
assert.equal(corrected.ok, true);
assert.equal(corrected.summary.ready, 1);
assert.equal(corrected.candidates[0].selected, true);

const plannedAdmission = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'PLAN-001', name: '预入院患者', bed: '', age: '', gender: '女', admissionState: 'planned', admissionDate: '2026-08-12', surgeon: '测试主刀', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), options);
assert.equal(plannedAdmission.summary.ready, 1);
assert.equal(plannedAdmission.candidates[0].isPreAdmission, true);
assert.equal(plannedAdmission.candidates[0].admissionLabel, '待入院');
assert.equal(plannedAdmission.candidates[0].bedDisplay, '待分配');
assert.match(plannedAdmission.candidates[0].warningText, /尚未分配床位/);

const missingBedForAdmitted = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'BED-001', name: '在院患者', bed: '', age: '', gender: '女', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), options);
assert.equal(missingBedForAdmitted.summary.blocked, 1);
assert.match(missingBedForAdmitted.candidates[0].errorText, /已入院患者必须填写床位/);

const invalidDayAdmission = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'DAY-001', name: '日间测试', bed: '8', age: '', gender: '女', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', patientType: '日间', diagnosis: '', allergies: '', surgeryDate: today, plannedDischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), options);
assert.equal(invalidDayAdmission.summary.blocked, 1);
assert.match(invalidDayAdmission.candidates[0].errorText, /日间患者必须填写计划出院日期/);

const multiWardOptions = { ...options, departmentWards: { '整形外科': ['综合一', '综合二'] } };
const missingWard = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'WARD-001', name: '病房缺失患者', ward: '', bed: '12', age: '', gender: '女', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), multiWardOptions);
assert.equal(missingWard.summary.blocked, 1);
assert.match(missingWard.candidates[0].errorText, /多个病房/);

const multiWard = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA, department: '整形外科',
  patients: [{ id: 'WARD-002', name: '病房患者', ward: '综合二', bed: '12', age: '', gender: '女', admissionState: 'admitted', admissionDate: today, surgeon: '测试主刀', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: true }],
}), multiWardOptions);
assert.equal(multiWard.summary.ready, 1);
assert.equal(multiWard.candidates[0].locationLabel, '综合二 · 12床');

const unmanaged = importer.parseAdmissionImport(JSON.stringify({
  schema: importer.ADMISSION_IMPORT_SCHEMA,
  department: '整形外科',
  patients: [{ id: 'OTHER-001', name: '测试患者', bed: '6', age: '', gender: '男', admissionState: 'admitted', admissionDate: today, surgeon: '其他医生', patientType: '普通', diagnosis: '', allergies: '', surgeryDate: '', dischargeDate: '', surgeryName: '', managedByDaihuanyu: false }],
}), options);
assert.equal(unmanaged.summary.blocked, 1);
assert.match(unmanaged.candidates[0].errorText, /由代寰宇负责管理/);

const badSchema = importer.parseAdmissionImport('{"schema":"other","patients":[]}', options);
assert.equal(badSchema.ok, false);

console.log('admission structured import parsing: passed');
