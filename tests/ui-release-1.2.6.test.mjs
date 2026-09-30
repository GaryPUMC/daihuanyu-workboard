import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

assert.equal(read('../VERSION').split(/\r?\n/)[0].trim(), '1.2.6');
assert.equal(read('../pages/home/home.wxml').includes('出院后待归档'), true);
assert.equal(read('../pages/home/home.wxml').includes('查看提醒 ›'), true);

const pageJs = read('../pages/medical-records/medical-records.js');
const pageWxml = read('../pages/medical-records/medical-records.wxml');
const pageWxss = read('../pages/medical-records/medical-records.wxss');
const store = read('../utils/workspace-store.js');

assert.equal(store.includes('medicalRecordPodsThrough(maxDisplayPod).reverse()'), true);
assert.equal(store.includes('compareMedicalRecordPatients'), true);
assert.equal(pageJs.includes('filterMedicalRecordRows'), true);
assert.equal(pageJs.includes('summarizeMedicalRecordRows'), true);
assert.equal(pageWxml.includes('登记已写日期'), false);
assert.equal(pageWxml.includes('wx:for="{{patient.pendingCells}}"'), true);
assert.equal(pageWxml.includes('hiddenPendingCount'), false);
assert.equal(pageWxml.includes('wx:for="{{patient.timeline}}"'), true);
assert.equal(pageWxml.includes('scroll-x="true"'), false);
assert.equal(pageWxml.includes('scroll-y="true"'), true);
assert.match(pageWxss, /\.record-viewport\s*\{[^}]*flex:\s*1/);
assert.doesNotMatch(pageWxss, /\.record-viewport\s*\{[^}]*height:\s*620rpx/);

const changelog = read('../releases/1.2.6/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('数据仅在当前设备处理和保存'), true);

console.log('1.2.6 medical-record board display and interaction checks: passed');
