import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const appConfig = read('../app.json');
const settingsJs = read('../pages/settings.js');
const settingsWxml = read('../pages/settings.wxml');
const managerJs = read('../pages/department-manager/department-manager.js');
const managerWxml = read('../pages/department-manager/department-manager.wxml');
const store = read('../utils/workspace-store.js');

assert.equal(appConfig.includes('pages/department-manager/department-manager'), true);
assert.equal(settingsJs.includes('goDepartmentManager'), true);
assert.equal(settingsWxml.includes('科室管理'), true);
assert.equal(settingsWxml.includes('病房显示规则'), false);
assert.equal(managerWxml.includes('data-tab="departments"'), true);
assert.equal(managerWxml.includes('data-tab="wards"'), true);
assert.equal(managerWxml.includes('data-direction="up"'), true);
assert.equal(managerWxml.includes('data-direction="down"'), true);
assert.equal(managerWxml.includes('longpress'), false);
assert.equal(managerJs.includes('addDepartmentWard'), true);
assert.equal(managerJs.includes('moveDepartmentWard'), true);
assert.equal(managerJs.includes('archiveDepartment'), true);
assert.equal(managerJs.includes('confirm-force-delete'), true);
assert.equal(managerJs.includes("removeSettingItem('departments'"), true);
assert.equal(store.includes('export function moveDepartment'), true);
assert.equal(store.includes('export function moveDepartmentWard'), true);
assert.equal(store.includes('export function archiveDepartment'), true);
assert.equal(store.includes('export function deleteDepartmentPermanently'), true);

console.log('department manager route, tabs, arrow sorting controls, and store entry: passed');
