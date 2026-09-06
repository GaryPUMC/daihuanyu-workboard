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
assert.equal(homeWxss.includes('.medical-record-entry'), true);

assert.equal(pageJs.includes('getMedicalRecordBoard'), true);
assert.equal(pageJs.includes('setMedicalRecordRequirementDone'), true);
assert.equal(pageJs.includes('toggleRequirement'), true);
assert.equal(pageWxml.includes('scroll-x="true"'), true);
assert.equal(pageWxml.includes('wx:for="{{podColumns}}"'), true);
assert.equal(pageWxml.includes('wx:for="{{patient.podCells}}"'), true);
assert.equal(pageWxml.includes('data-requirement-key'), true);
assert.equal(pageWxml.includes('bindtap="toggleRequirement"'), true);
assert.equal(pageWxml.includes('未点击仅表示本机尚未确认'), true);
assert.equal(pageWxss.includes('.record-cell.severe'), true);
assert.equal(pageWxss.includes('.record-cell.today'), true);
assert.equal(pageWxss.includes('.record-cell.window'), true);
assert.equal(pageWxss.includes('.record-cell.done'), true);
assert.equal(pageWxss.includes('.patient-column'), true);

console.log('medical-record reminder table UI and home entry: passed');
