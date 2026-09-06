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

assert.equal(store.addSettingItem('departments', '测试科室'), true);
assert.equal(store.addDepartmentWard('测试科室', '测试一病房').ok, true);
assert.equal(store.addDepartmentWard('测试科室', '测试二病房').ok, true);
assert.equal(store.createPatient({ id: 'DEPT-LIFECYCLE-001', name: '脱敏患者', gender: '女', patientType: '普通', department: '测试科室', ward: '测试一病房', bed: '1', admissionState: 'admitted', admissionDate: '2026-09-06', surgeon: '脱敏主刀', allergyStatus: 'unknown' }).ok, true);

assert.equal(store.archiveDepartment('测试科室').ok, true);
assert.equal(store.getWorkspace().settings.departments.includes('测试科室'), false);
assert.equal(store.getWorkspace().settings.archivedDepartments.includes('测试科室'), true);
assert.deepEqual(store.getDepartmentWards('测试科室', store.getWorkspace().settings), ['测试一病房', '测试二病房']);
assert.equal(store.getDepartmentUsage('测试科室').activePatients, 1);
assert.equal(store.restoreDepartment('测试科室').ok, true);
assert.match(store.removeSettingItem('departments', '测试科室').error, /关联患者或回收站记录/);

assert.equal(store.revokePatientRegistration('DEPT-LIFECYCLE-001').ok, true);
assert.equal(store.getDepartmentUsage('测试科室').revokedPatients, 1);
assert.equal(store.deleteDepartmentPermanently('测试科室').ok, true);
assert.equal(store.getWorkspace().settings.departments.includes('测试科室'), false);
assert.equal(store.getWorkspace().settings.archivedDepartments.includes('测试科室'), false);
assert.equal(store.getWorkspace().settings.departmentWards['测试科室'], undefined);
assert.equal(store.getDepartmentUsage('测试科室').totalPatients, 0);
assert.equal(store.deleteDepartmentPermanently('整形外科').ok, false);

storage.set('daihuanyu_workboard_local_v3', { schemaVersion: 13, settings: { activeDepartment: '唯一科室', departments: ['唯一科室'] }, patients: [] });
assert.match(store.removeSettingItem('departments', '唯一科室').error, /至少保留一个在用科室/);
assert.match(store.deleteDepartmentPermanently('唯一科室').error, /至少保留一个在用科室/);

console.log('department archiving, recovery, dependency blocking, and permanent deletion: passed');
