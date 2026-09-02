import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftTools = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const context = {
  today: '2026-09-02',
  activeDepartment: '整形外科',
  departments: ['整形外科', '骨科'],
  departmentWards: {
    整形外科: ['普通病房', '日间病房', '国疗病房'],
    骨科: ['骨科一病房', '骨科二病房'],
  },
  existingPatients: [{ id: 'EXISTS-001' }],
};

const base = {
  id: 'NEW-001', name: '脱敏患者', gender: '女', patientType: '普通', department: '', ward: '', bed: '',
  admissionState: 'planned', admissionDate: '2026-09-02', surgeon: '脱敏主刀', allergyStatus: 'unknown',
  surgeryDate: '', plannedDischargeDate: '',
};

const ordinary = draftTools.validatePatientDraft(base, context);
assert.equal(ordinary.ok, true);
assert.equal(ordinary.value.department, '整形外科');
assert.equal(ordinary.value.ward, '普通病房');
assert.equal(ordinary.value.bed, '');

const day = draftTools.validatePatientDraft({
  ...base, id: 'NEW-DAY', patientType: '日间', surgeryDate: '2026-09-02', plannedDischargeDate: '2026-09-02',
}, context);
assert.equal(day.ok, true);
assert.equal(day.value.department, '整形外科');
assert.equal(day.value.ward, '日间病房');

const national = draftTools.validatePatientDraft({ ...base, id: 'NEW-NATIONAL', patientType: '国疗' }, context);
assert.equal(national.ok, false);
assert.equal(national.value.department, '');
assert.match(national.fieldErrors.department, /国疗患者/);

const nationalWithDepartment = draftTools.validatePatientDraft({
  ...base, id: 'NEW-NATIONAL-2', patientType: '国疗', department: '整形外科', ward: '',
}, context);
assert.equal(nationalWithDepartment.ok, false);
assert.match(nationalWithDepartment.fieldErrors.ward, /手动选择病房/);

const unknownType = draftTools.validatePatientDraft({ ...base, id: 'NEW-UNKNOWN', patientType: '' }, context);
assert.equal(unknownType.ok, false);
assert.equal(unknownType.value.patientType, '');
assert.match(unknownType.fieldErrors.patientType, /请选择患者类型/);

const unknownAdmission = draftTools.validatePatientDraft({ ...base, id: 'NEW-STATE', admissionState: '' }, context);
assert.equal(unknownAdmission.ok, false);
assert.match(unknownAdmission.fieldErrors.admissionState, /请选择待入院或已入院/);

const admittedWithoutBed = draftTools.validatePatientDraft({ ...base, id: 'NEW-ADMITTED', admissionState: 'admitted' }, context);
assert.equal(admittedWithoutBed.ok, false);
assert.match(admittedWithoutBed.fieldErrors.bed, /已入院患者必须填写床位/);

const admitted = draftTools.validatePatientDraft({ ...base, id: 'NEW-ADMITTED-2', admissionState: 'admitted', bed: '12床' }, context);
assert.equal(admitted.ok, true);
assert.equal(admitted.value.bed, '12');

const duplicate = draftTools.validatePatientDraft({ ...base, id: 'EXISTS-001' }, context);
assert.equal(duplicate.ok, false);
assert.match(duplicate.fieldErrors.id, /已存在/);

console.log('shared patient draft normalization and validation: passed');
