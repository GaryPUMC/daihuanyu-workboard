import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));
const appConfig = read('../app.json');
const home = read('../pages/home/home.wxml');
const homeJs = read('../pages/home/home.js');
const detail = read('../pages/patient-detail/patient-detail.wxml');
const detailJs = read('../pages/patient-detail/patient-detail.js');
const patients = read('../pages/patients/patients.wxml');
const patientsJs = read('../pages/patients/patients.js');
const rounds = read('../pages/rounds/rounds.wxml');
const roundsJs = read('../pages/rounds/rounds.js');
const settings = read('../pages/settings.wxml');
const settingsJs = read('../pages/settings.js');
const admissionImport = read('../pages/admission-import/admission-import.wxml');
const admissionImportJs = read('../pages/admission-import/admission-import.js');
const dialog = read('../components/wb-dialog/wb-dialog.wxml');
const dialogStyle = read('../components/wb-dialog/wb-dialog.wxss');
const sheet = read('../components/wb-sheet/wb-sheet.wxml');
const sheetStyle = read('../components/wb-sheet/wb-sheet.wxss');
const store = read('../utils/workspace-store.js');
const project = read('../PROJECT.md');
const version = read('../VERSION').split(/\r?\n/)[0].trim();

assert.match(version, /^1\.2\./);
assert.equal(appConfig.includes('pages/templates/templates'), false);
assert.equal(appConfig.includes('pages/workflow-settings/workflow-settings'), false);
assert.equal(exists('../utils/ai-privacy.js'), false);

// 1.2.0 统一弹层：页面不再直接叠加系统确认窗，编辑面板不再整体 transform 抬升。
['../components/wb-dialog/wb-dialog.js', '../components/wb-dialog/wb-dialog.json', '../components/wb-dialog/wb-dialog.wxml', '../components/wb-dialog/wb-dialog.wxss', '../components/wb-sheet/wb-sheet.js', '../components/wb-sheet/wb-sheet.json', '../components/wb-sheet/wb-sheet.wxml', '../components/wb-sheet/wb-sheet.wxss'].forEach((path) => assert.equal(exists(path), true));
assert.equal(appConfig.includes('"wb-dialog"'), true);
assert.equal(appConfig.includes('"wb-sheet"'), true);
[homeJs, detailJs, patientsJs, roundsJs, settingsJs, admissionImportJs].forEach((source) => assert.equal(source.includes('wx.showModal'), false));
[detail, rounds, admissionImport].forEach((source) => {
  assert.equal(source.includes('translate3d(0, -{{editorKeyboardHeight}}px'), false);
  assert.equal(source.includes('bindblur="editorBlur"'), false);
});
assert.equal(rounds.includes('auto-height'), false);
assert.equal(detail.includes('editor.warningText'), true);
assert.equal(dialog.includes('<root-portal'), true);
assert.equal(dialog.includes('catchtouchmove="blockBackgroundTouch"'), true);
assert.equal(dialog.includes('<scroll-view'), true);
assert.equal(sheet.includes('<root-portal'), true);
assert.equal(sheet.includes('<scroll-view'), true);
assert.equal(sheet.includes('class="sheet-footer'), true);
assert.equal(sheet.includes('sheet-discard'), true);
assert.equal(sheet.includes('放弃修改'), true);
assert.equal(sheetStyle.includes('env(safe-area-inset-bottom)'), true);
assert.equal(sheetStyle.includes('min-height: 76rpx'), true);
assert.equal(sheetStyle.includes('height: 62rpx'), true);
assert.equal(dialogStyle.includes('min-height: 76rpx'), true);
assert.equal(dialogStyle.includes('height: 62rpx'), true);
assert.equal(sheetStyle.includes('transition:'), false);
assert.equal(dialogStyle.includes('transition:'), false);
assert.equal(homeJs.includes('dialogBusy'), true);
assert.equal(detailJs.includes('dialogBusy'), true);
assert.equal(detailJs.includes('editorSaveBusy'), true);
assert.equal(settingsJs.includes('dialogBusy'), true);
assert.equal(admissionImportJs.includes('dialogBusy'), true);
assert.equal(appConfig.includes('pages/admission-candidate-edit/admission-candidate-edit'), true);
assert.equal(admissionImport.includes('<wb-sheet'), false);
assert.equal(roundsJs.includes('roundSaveBusy'), true);
assert.equal(roundsJs.includes("'roundEditor.dirty': true"), true);
['../pages/templates/templates.js', '../pages/templates/templates.wxml', '../pages/workflow-settings/workflow-settings.js', '../pages/workflow-settings/workflow-settings.wxml'].forEach((path) => assert.equal(exists(path), false));

// 设置与患者详情必须完整移除流程/路径入口和操作，而不只是隐藏。
['路径与流程', '围术期路径模板', '科室流程与关键项'].forEach((text) => assert.equal(settings.includes(text), false));
assert.equal(settingsJs.includes('goTemplates'), false);
assert.equal(settingsJs.includes('goWorkflows'), false);
['住院流程', '当前节点建议', '流程记录', 'selectStage', 'addReminder'].forEach((text) => {
  assert.equal(detail.includes(text), false);
  assert.equal(detailJs.includes(text), false);
});
assert.equal(detail.includes('独立记录，不推进流程'), true);
assert.equal(detail.includes('togglePreopCheck'), true);
assert.equal(detailJs.includes('confirmSurgeryName'), true);
assert.equal(detail.includes('taskPriorities'), true);
assert.equal(detail.includes('归档患者'), true);
assert.equal(detail.includes('撤回出院'), true);

// 首页不得再计算阶段、筛选、推荐或流程停滞。
['getPatientReminders', 'addReminderAsTask', 'departmentWorkflows', 'activeStage', 'workflowStallMessage', 'selectStage', 'stalledMessage', 'goTemplates'].forEach((text) => assert.equal(homeJs.includes(text), false));
assert.equal(home.includes('task.stage'), false);
assert.equal(home.includes('今日需拍照患者'), true);
assert.equal(home.includes('今日 PPT 患者'), true);
assert.equal(home.includes('今日需放疗患者'), true);
assert.equal(home.includes('查房 · 引流重点'), true);
assert.equal(home.includes('出院后待归档'), true);
assert.equal(homeJs.includes("careStatus === '已出院'"), true);
assert.equal(home.includes('class="nav-actions"'), false);
assert.equal(home.includes('class="privacy-toggle"'), false);
assert.equal(home.includes('class="avatar"'), false);
assert.equal(home.includes('class="privacy-strip"'), true);
assert.equal(home.includes('class="settings-entry"'), true);
assert.equal(home.includes('navRightPadding'), true);
assert.equal(homeJs.includes('getMenuButtonBoundingClientRect'), true);

// 用户可见状态只有事实状态；手术日/POD 仍作为日期信息。
assert.equal(store.includes("return '待入院'"), true);
assert.equal(store.includes("return '在院'"), true);
assert.equal(store.includes("return '已出院'"), true);
assert.equal(store.includes('待确认出院'), false);
assert.equal(detail.includes('相对手术日'), true);
assert.equal(detail.includes('{{patient.podText}}'), true);
assert.equal(home.includes('class="pod-badge"'), true);
assert.equal(patientsJs.includes("getPatientStatus(patient) === '已出院'"), true);
assert.equal(roundsJs.includes("getPatientStatus(patient) === '在院'"), true);

// schema 10 兼容层退休旧工作流，且不再提供生成、推荐或推进 API。
assert.match(store, /const SCHEMA_VERSION = 1[01]/);
assert.equal(store.includes('legacyWorkflow'), true);
assert.equal(store.includes('已退休的系统流程任务'), true);
assert.equal(store.includes('旧路径转普通待办'), true);
['stageRequirementTasks', 'export function changePatientStage', 'export function ensureStageTasks', 'export function getPatientReminders', 'export function addReminderAsTask', 'export function addTasksFromDrafts', 'export function saveDepartmentWorkflow'].forEach((text) => assert.equal(store.includes(text), false));
assert.equal(store.includes('export function setPreopCheck'), true);
assert.equal(store.includes('export function confirmSurgeryName'), true);
assert.equal(store.includes('pendingCriticalTasks = []'), true);
assert.equal(store.includes('task.effect && task.effect.key'), false);

// 保留的独立工作功能和病房/床位语义。
assert.equal(detail.includes('术前核查'), true);
assert.equal(detail.includes('正式术式'), true);
assert.equal(detail.includes('仅记录一助医生'), true);
assert.equal(detail.includes('添加 POD 行'), true);
assert.equal(detail.includes('协作文本'), true);
assert.equal(rounds.includes('保存查房'), true);
['主诉／症状', '查体', '检验／检查结果', '评估', '计划'].forEach((text) => assert.equal(rounds.includes(text), false));
assert.equal(rounds.includes('value="{{roundEditor.content}}"'), true);
assert.equal(rounds.includes('maxlength="-1"'), true);
assert.equal(roundsJs.includes('content: existing ? existing.content'), true);
assert.equal(detail.includes('{{item.content}}'), true);
['round.symptoms', 'round.exam', 'round.results', 'round.assessment', 'round.plan', 'round.rawText'].forEach((text) => assert.equal(store.includes(text), false));
assert.equal(patients.includes('新增患者'), true);
['床位待分配', '病房待分配', '病房及床位待分配'].forEach((text) => assert.equal(store.includes(text), true));
assert.equal(store.includes('export function dischargePatient'), true);
assert.equal(store.includes('export function revertPatientDischarge'), true);
assert.equal(store.includes('export function archivePatient'), true);
assert.equal(store.includes('export function revokePatientRegistration'), true);

// 隐私、本机数据与发布文案边界继续存在。
assert.equal(settings.includes('生成并校验'), true);
assert.equal(settings.includes('撤销建档回收站'), true);
assert.equal(settingsJs.includes('verifyBackup'), true);
assert.equal(detail.includes('仅复制，不自动发送'), true);
assert.equal(home.includes('数据仅保存在当前设备'), true);
assert.equal(project.includes('本小程序不提供AI服务'), true);

const changelog = read('../releases/1.2.0/UPLOAD_CHANGELOG.md').trim();
assert.equal(changelog.length <= 200, true);
assert.equal(changelog.includes('本小程序不提供AI服务'), true);
assert.equal(exists('../releases/1.2.0/source.tar.gz'), true);

console.log('1.2.0 compact modal and sheet release checks: passed');
