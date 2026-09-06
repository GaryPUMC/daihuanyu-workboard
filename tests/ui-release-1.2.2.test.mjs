import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));
const store = read('../utils/workspace-store.js');
const detailJs = read('../pages/patient-detail/patient-detail.js');
const detailWxml = read('../pages/patient-detail/patient-detail.wxml');
const settingsWxml = read('../pages/settings.wxml');
const homeWxml = read('../pages/home/home.wxml');

assert.match(read('../VERSION').split(/\r?\n/)[0].trim(), /^1\.2\./);
assert.match(store, /const SCHEMA_VERSION = \d+/);
assert.equal(store.includes('migratePreopRecordsToEvents'), true);
assert.equal(store.includes('PREOP_MIGRATION_SNAPSHOT_KEY'), true);
assert.equal(store.includes('export function setPreopCheck'), false);

assert.equal(detailJs.includes('const PREOP_CHECKS'), false);
assert.equal(detailJs.includes('setPreopCheck'), false);
assert.equal(detailJs.includes("setPreopCheck(patientId, 'photosCompleted'"), false, '复制拍照文本不得再写入旧术前核查字段');
assert.equal(detailWxml.includes('wx:for="{{patient.preopChecks}}"'), false);
assert.equal(detailWxml.includes('bindtap="openSurgeryNameConfirm"'), true);
assert.equal(detailWxml.includes('与主刀确认正式术式'), true);
assert.equal(detailWxml.includes('术前拍照'), false);
['核查手术同意书等已签署', '核查术前检查已完善并打印化验单', '核查入院病史已签字', '完成术前拍照'].forEach((title) => {
  assert.equal(detailJs.includes(title), false);
  assert.equal(detailWxml.includes(title), false);
});

assert.equal(settingsWxml.includes('旧版术前核查已转换'), true);
assert.equal(settingsWxml.includes('升级前请先生成并校验加密备份'), true);
assert.equal(homeWxml.includes('出院后待归档'), true);
assert.equal(exists('../releases/1.2.2/USER_MIGRATION_GUIDE.md'), true);
assert.equal(exists('../releases/1.2.2/RELEASE.md'), true);
const changelog = read('../releases/1.2.2/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('数据仅在当前设备处理和保存'), true);

console.log('1.2.2 single surgery confirmation and v12 migration UI checks: passed');
