import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));
const store = read('../utils/workspace-store.js');
const appConfig = read('../app.json');
const home = read('../pages/home/home.wxml');
const page = read('../pages/medical-records/medical-records.wxml');

assert.match(read('../VERSION').split(/\r?\n/)[0].trim(), /^1\.2\./);
assert.equal(store.includes('const SCHEMA_VERSION = 13'), true);
assert.equal(store.includes('medicalRecordCompletions'), true);
assert.equal(store.includes('MEDICAL_RECORD_MIGRATION_SNAPSHOT_KEY'), true);
assert.equal(store.includes('getMedicalRecordBoard'), true);
assert.equal(store.includes('setMedicalRecordRequirementDone'), true);
assert.equal(appConfig.includes('pages/medical-records/medical-records'), true);
assert.equal(home.includes('病历书写提醒'), true);
assert.equal(home.includes('出院后待归档'), true);
assert.equal(page.includes('未点击仅表示本机尚未确认'), true);
assert.equal(page.includes('院内正式病历为准'), true);
assert.equal(page.includes('patient.rounds'), false, '查房文字不得参与正式病历完成判断');

['../pages/medical-records/medical-records.js', '../pages/medical-records/medical-records.wxml', '../pages/medical-records/medical-records.wxss', '../pages/medical-records/medical-records.json'].forEach((path) => assert.equal(exists(path), true));
assert.equal(exists('../releases/1.2.3/RELEASE.md'), true);
assert.equal(exists('../releases/1.2.3/USER_MIGRATION_GUIDE.md'), true);
const changelog = read('../releases/1.2.3/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('数据仅在当前设备处理和保存'), true);

console.log('1.2.3 medical-record reminder and schema 13 release checks: passed');
