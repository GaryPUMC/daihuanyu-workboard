import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

assert.equal(exists('../pages/medical-records/medical-records.js'), true);
assert.equal(exists('../pages/medical-records/medical-records.wxml'), true);
assert.equal(exists('../pages/medical-records/medical-records.wxss'), true);
assert.equal(exists('../pages/medical-records/medical-records.json'), true);

const appConfig = read('../app.json');
const homeJs = read('../pages/home/home.js');
const homeWxml = read('../pages/home/home.wxml');
const homeWxss = read('../pages/home/home.wxss');
const pageJs = read('../pages/medical-records/medical-records.js');
const pageWxml = read('../pages/medical-records/medical-records.wxml');
const pageWxss = read('../pages/medical-records/medical-records.wxss');

assert.equal(appConfig.includes('pages/medical-records/medical-records'), true);
assert.equal(homeJs.includes('getMedicalRecordBoard'), true);
assert.equal(homeJs.includes('goMedicalRecords'), true);
assert.equal(homeWxml.includes('病历书写提醒'), true);
assert.equal(homeWxml.includes('bindtap="goMedicalRecords"'), true);
assert.equal(homeWxml.includes('查看提醒 ›'), true);
assert.equal(homeWxml.includes('进入表格'), false);
assert.equal(homeWxss.includes('.medical-record-entry'), true);

assert.equal(pageJs.includes('getMedicalRecordBoard'), true);
assert.equal(pageJs.includes('setMedicalRecordRequirementDone'), true);
assert.equal(pageJs.includes('toggleRequirement'), true);
assert.equal(pageWxml.includes('scroll-x="true"'), false, '主列表不应再依赖横向滚动');
assert.equal(pageWxml.includes('scroll-y="true"'), true);
assert.equal(pageWxml.includes('class="record-viewport"'), true);
assert.equal(pageWxml.includes('登记已写日期'), false, '不得保留与节点按钮重复的鸡肋入口');
assert.equal(pageWxml.includes('还有{{patient.hiddenPendingCount}}项'), false, '不得隐藏部分未写病历');
assert.equal(pageWxml.includes('wx:for="{{patient.pendingCells}}"'), true, '主列表应直接展示全部未写病历');
assert.equal(pageWxml.includes('wx:for="{{patient.timeline}}"'), true);
assert.equal(pageWxml.includes('项未写'), true);
assert.equal(pageWxml.includes('下次'), true);
assert.equal(pageWxml.includes('全部节点'), true);
assert.equal(pageWxml.includes('data-requirement-key'), true);
assert.equal(pageWxml.includes('catchtap="toggleRequirement"'), true);
assert.equal(pageWxml.includes('未点击仅表示本机尚未确认'), true);
assert.equal(pageWxss.includes('.record-chip.severe'), true);
assert.equal(pageWxss.includes('.record-chip.today'), true);
assert.equal(pageWxss.includes('.timeline-status.window'), true);
assert.equal(pageWxss.includes('.timeline-status.done'), true);
assert.equal(pageWxss.includes('.patient-summary'), true);
assert.equal(pageWxss.includes('.patient-timeline'), true);
assert.match(pageWxss, /\.record-viewport\s*\{[^}]*flex:\s*1/, '列表视窗应占满页面剩余高度');
assert.doesNotMatch(pageWxss, /\.record-viewport\s*\{[^}]*height:\s*620rpx/, '不得继续使用无法适配小窗的固定高度');
assert.equal(pageJs.includes('filterMedicalRecordRows'), true, '“仅看未写”不应混入“出院待补”患者');
assert.equal(pageJs.includes('summarizeMedicalRecordRows'), true, '页面统计应随当前视图同步，避免表里不一致');
assert.equal(pageJs.includes('recentlyCompletedPatientId'), true, '仅看未写中完成最后一项后应留出撤销缓冲');

console.log('medical-record compact reminder UI and home entry: passed');
