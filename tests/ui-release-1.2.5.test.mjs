import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

assert.equal(read('../VERSION').includes('1.2.5：'), true, 'VERSION 应保留 1.2.5 历史记录');
assert.equal(read('../app.json').includes('pages/department-manager/department-manager'), true);

const manager = read('../pages/department-manager/department-manager.wxml');
['data-tab="departments"', 'data-tab="wards"', '已归档科室'].forEach((text) => {
  assert.equal(manager.includes(text), true, `缺少科室管理交互：${text}`);
});

const managerJs = read('../pages/department-manager/department-manager.js');
['moveDepartment', 'moveDepartmentWard', 'archiveDepartment', 'restoreDepartment', 'deleteDepartmentPermanently', 'confirm-force-delete', 'force-delete-department', '再次确认永久删除', '病房配置也会同时移除'].forEach((text) => {
  assert.equal(managerJs.includes(text), true, `缺少科室管理操作：${text}`);
});

const store = read('../utils/workspace-store.js');
['archivedDepartments', 'getDepartmentUsage', 'archiveDepartment', 'restoreDepartment', 'deleteDepartmentPermanently', '至少保留一个在用科室'].forEach((text) => {
  assert.equal(store.includes(text), true, `缺少存储层保护：${text}`);
});

assert.equal(read('../pages/home/home.wxml').includes('出院后待归档'), true);
const changelog = read('../releases/1.2.5/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('数据仅在当前设备处理和保存'), true);

console.log('1.2.5 department and ward management release checks: passed');
