import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const upperMarker = String.fromCharCode(65, 73);
const legacySetting = ['ai', 'Gateway', 'Configured'].join('');
const visibleSources = [
  '../pages/settings.wxml',
  '../pages/patients/patients.wxml',
  '../pages/admission-import/admission-import.wxml',
  '../pages/admission-import/admission-import.json',
  '../pages/admission-candidate-edit/admission-candidate-edit.wxml',
  '../PROJECT.md',
  '../VERSION',
];

assert.equal(read('../releases/1.2.4/RELEASE.md').includes('# 1.2.4 本地发布说明'), true);
assert.equal(read('../pages/home/home.wxml').includes('出院后待归档'), true);
visibleSources.forEach((path) => {
  assert.equal(read(path).includes(upperMarker), false, `${path} 仍含旧技术标识`);
});
assert.equal(read('../utils/workspace-store.js').includes(legacySetting), false, '默认设置仍含废弃的外部服务标记');

const importPage = read('../pages/admission-import/admission-import.wxml');
assert.equal(importPage.includes('结构化导入'), false, '页面步骤应使用自然操作文案而非重复标题');
assert.equal(importPage.includes('复制整理格式'), true);
assert.equal(importPage.includes('内容只在本机解析和保存'), true);
assert.equal(read('../pages/patients/patients.wxml').includes('结构化导入'), true);
assert.equal(read('../pages/admission-import/admission-import.json').includes('结构化导入今日入院'), true);

const store = read('../utils/workspace-store.js');
const reminderPage = read('../pages/medical-records/medical-records.js');
assert.equal(store.includes("if (!dateKey || !validDateKey(dateKey)) return '';"), true);
assert.equal(store.includes('stillSatisfied'), true);
assert.equal(store.includes('remainingLinkedPod'), true);
assert.equal(reminderPage.includes('已撤销单独确认，仍由POD'), true);

const settingsPage = read('../pages/settings.js');
assert.equal(settingsPage.includes('getDatedBackupFileName(todayKey())'), true);
assert.equal(settingsPage.includes('backupFileName'), true);
assert.equal(read('../utils/backup-name.js').includes('加密备份_${compactDate}.dhwb'), true);

const changelog = read('../releases/1.2.4/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('数据仅在当前设备处理和保存'), true);
assert.equal(changelog.includes(upperMarker), false);

console.log('1.2.4 neutral terminology and reminder edge-case checks: passed');
