import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, root));

const version = (read('VERSION').split(/\r?\n/).find((line) => line.trim()) || '').trim();
assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'VERSION 必须为语义化版本号');
assert.equal(exists('project.private.config.json'), true, '本机私有配置应存在但不得纳入发布包');
assert.equal(exists('utils/ai-privacy.js'), false, '旧查房建议草稿模块仍存在');

const appConfig = read('app.json');
['pages/home/home', 'pages/rounds/rounds', 'pages/settings'].forEach((page) => {
  assert.equal(appConfig.includes(page), true, `缺少页面：${page}`);
});
['pages/templates/templates', 'pages/workflow-settings/workflow-settings'].forEach((page) => {
  assert.equal(appConfig.includes(page), false, `旧流程页面仍在路由中：${page}`);
});

const store = read('utils/workspace-store.js');
const roundsPage = read('pages/rounds/rounds.wxml');
assert.match(store, /const SCHEMA_VERSION = \d+/, '缺少数据 schema 版本');
assert.equal(store.includes('prepareBackupImport'), true, '缺少备份导入校验');
assert.equal(store.includes('getWorkspaceIntegrity'), true, '缺少关联完整性校验');
assert.equal(store.includes('const SCHEMA_VERSION = 11'), true, '当前版本必须使用 schema 11');
assert.equal(store.includes('legacyWorkflow'), true, '缺少旧流程兼容层');
['stageRequirementTasks', 'export function changePatientStage', 'export function getPatientReminders', 'export function addTasksFromDrafts'].forEach((symbol) => {
  assert.equal(store.includes(symbol), false, `旧流程运行逻辑仍存在：${symbol}`);
});
assert.equal(store.includes('task.effect && task.effect.key'), false, '普通待办仍会触发旧流程隐藏副作用');
assert.equal(roundsPage.includes('maxlength="-1"'), true, '纯文字查房必须允许不限长度录入');
['主诉／症状', '检验／检查结果', '当日临床评估'].forEach((text) => assert.equal(roundsPage.includes(text), false, `旧结构化查房字段仍存在：${text}`));
['round.symptoms', 'round.exam', 'round.results', 'round.assessment', 'round.plan', 'round.rawText'].forEach((text) => assert.equal(store.includes(text), false, `旧结构化查房数据字段仍存在：${text}`));

const uiCheckPath = `tests/ui-release-${version}.test.mjs`;
assert.equal(exists(uiCheckPath), true, `缺少当前版本 UI 回归检查：${uiCheckPath}`);
const uiCheck = read(uiCheckPath);
const dataCheck = read('tests/v3-import-demo.test.mjs');
const testFiles = fs.readdirSync(new URL('tests/', root)).filter((file) => file.endsWith('.test.mjs')).map((file) => `tests/${file}`);
assert.equal(uiCheck.includes('出院后待归档'), true, '缺少出院待归档界面回归检查');
assert.equal(dataCheck.includes('restoreRevokedRegistration'), true, '缺少撤销建档恢复回归检查');
assert.equal(testFiles.includes('tests/six-patient-clinical-flow.test.mjs'), true, '缺少六患者完整临床流程验收测试');
assert.equal(testFiles.includes('tests/fifty-patient-benchmark.test.mjs'), true, '缺少50患者大型回归测试');
const sixPatientCheck = read('tests/six-patient-clinical-flow.test.mjs');
assert.equal(sixPatientCheck.includes('const SIX_PATIENTS = ['), true, '六患者测试夹具缺失');
assert.equal(sixPatientCheck.includes("'国疗'"), true, '六患者测试未覆盖国疗患者');
assert.equal(sixPatientCheck.includes("'日间'"), true, '六患者测试未覆盖日间患者');
assert.equal(sixPatientCheck.includes('restorePreviousWorkspace'), true, '六患者测试未覆盖恢复前快照回退');
const fiftyPatientCheck = read('tests/fifty-patient-benchmark.test.mjs');
const fiftyPatientFixture = read('tests/fixtures/fifty-patient-benchmark.mjs');
assert.equal(fiftyPatientCheck.includes('FIFTY_PATIENT_SCENARIOS'), true, '50患者测试夹具缺失');
assert.equal(fiftyPatientCheck.includes('restorePreviousWorkspace'), true, '50患者测试未覆盖恢复前快照回退');
assert.equal(fiftyPatientFixture.includes('createFiftyPatientDemo(todayKey())'), true, '50患者基准集生成器未正确复用');
const fiftyPatientSource = read('utils/fifty-patient-demo.js');
assert.equal(fiftyPatientSource.includes('Array.from({ length: 50 }'), true, '50患者基准集数量不正确');
assert.equal(fiftyPatientSource.includes("'日间'"), true, '50患者基准集未覆盖日间患者');
assert.equal(fiftyPatientSource.includes("'国疗'"), true, '50患者基准集未覆盖国疗患者');

const changelog = read(`releases/${version}/UPLOAD_CHANGELOG.md`).trim();
assert.equal(changelog.length <= 200, true, '上传更新日志不得超过 200 字');
assert.equal(changelog.includes('本小程序不提供AI服务'), true, '上传更新日志必须声明“本小程序不提供AI服务”');
assert.equal(exists(`releases/${version}/RELEASE.md`), true, '缺少本地发布说明');
assert.equal(exists(`releases/${version}/source.tar.gz`), true, '缺少本地源码上传包');

execFileSync(process.execPath, ['--test', ...testFiles], { cwd: rootPath, stdio: 'inherit' });
console.log(`release preflight source checks: passed (${version})`);
