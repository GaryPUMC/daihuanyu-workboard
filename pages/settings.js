import { addDepartmentWard, addRoundActionTemplate, addSettingItem, formatBeijingDateTime, getBackupSummary, getDepartmentWards, getRestoreSnapshotSummary, getRevokedRegistrations, getWorkspace, prepareBackupImport, recordBackupVerification, removeDepartmentWard, removeRoundActionTemplate, removeSettingItem, restorePreviousWorkspace, restoreRevokedRegistration, restoreWorkspace } from '../utils/workspace-store';
import { decryptBackup, encryptBackup } from '../utils/secure-backup';
import { createDialog, emptyDialog } from '../utils/ui-state';

const sectionDefinitions = [
  { key: 'departments', title: '轮转科室', desc: '用于患者归属与首页科室切换。', placeholder: '添加科室' },
  { key: 'procedures', title: '术式', desc: '用于患者建档、编辑与正式术式核对。', placeholder: '添加术式' },
  { key: 'diagnoses', title: '诊断常用词', desc: '为后续快速录入预留的常用诊断简称。', placeholder: '添加诊断简称' },
  { key: 'taskCategories', title: '任务分类', desc: '用于患者详情中新增待办时的分类选择。', placeholder: '添加任务分类' },
];

Page({
  data: {
    sections: [], departments: [], inputs: {}, roundActions: [], roundActionInput: '', wardDepartmentIndex: 0, wardDepartment: '', wards: [], wardInput: '', backupPassword: '', backupPath: '', backupSummary: {}, restoreSnapshot: null, revokedRegistrations: [], dialog: emptyDialog(),
  },
  onShow() { this.loadSettings(); },
  loadSettings() {
    const workspace = getWorkspace();
    const sections = sectionDefinitions.map((section) => ({ ...section, items: workspace.settings[section.key] || [] }));
    const wardDepartment = workspace.settings.departments.includes(this.data.wardDepartment) ? this.data.wardDepartment : workspace.settings.activeDepartment;
    const wardDepartmentIndex = Math.max(0, workspace.settings.departments.indexOf(wardDepartment));
    const revokedRegistrations = getRevokedRegistrations().map((item) => ({
      ...item,
      revokedAtText: formatBeijingDateTime(item.revokedAt),
      recordCount: Object.values(item.records || {}).reduce((count, records) => count + (records || []).length, 0),
    }));
    const restoreSnapshot = getRestoreSnapshotSummary();
    this.setData({ sections, departments: workspace.settings.departments, roundActions: workspace.settings.roundActionTemplates || [], wardDepartment, wardDepartmentIndex, wards: getDepartmentWards(wardDepartment, workspace.settings), backupSummary: getBackupSummary(workspace), restoreSnapshot: restoreSnapshot && !restoreSnapshot.invalid ? { ...restoreSnapshot, savedAtText: formatBeijingDateTime(restoreSnapshot.savedAt) } : null, revokedRegistrations });
  },
  openDialog(config) { wx.hideKeyboard({ complete: () => this.setData({ dialog: createDialog(config) }) }); },
  showInfo(title, message, tone = 'default') { this.openDialog({ title, message, tone, confirmText: '知道了', showCancel: false, action: 'dismiss' }); },
  closeDialog() { if (!this.data.dialog.loading) this.setData({ dialog: emptyDialog() }); },
  finishDialog() { this.dialogBusy = false; this.setData({ dialog: emptyDialog() }); },
  failDialog(title, message) {
    this.dialogBusy = false;
    this.setData({ dialog: createDialog({ title, message, confirmText: '知道了', showCancel: false, action: 'dismiss' }) });
  },
  inputSetting(e) { this.setData({ [`inputs.${e.currentTarget.dataset.category}`]: e.detail.value }); },
  inputPassword(e) { this.setData({ backupPassword: e.detail.value }); },
  inputRoundAction(e) { this.setData({ roundActionInput: e.detail.value }); },
  inputWard(e) { this.setData({ wardInput: e.detail.value }); },
  chooseWardDepartment(e) {
    const workspace = getWorkspace();
    const wardDepartment = workspace.settings.departments[Number(e.detail.value)] || '';
    this.setData({ wardDepartment, wardInput: '' }, () => this.loadSettings());
  },
  addWard() {
    const result = addDepartmentWard(this.data.wardDepartment, this.data.wardInput.trim());
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.setData({ wardInput: '' });
    this.loadSettings();
  },
  removeWard(e) {
    const ward = e.currentTarget.dataset.ward;
    this.openDialog({ title: '移除病房？', message: `“${ward}”不再用于新建或导入。已有患者不会被自动改动。`, confirmText: '移除', tone: 'danger', action: 'remove-ward', payload: { ward } });
  },
  addRoundAction() {
    const title = this.data.roundActionInput.trim();
    if (!title) return wx.showToast({ title: '请输入操作名称', icon: 'none' });
    if (!addRoundActionTemplate(title)) return wx.showToast({ title: '已存在相同操作', icon: 'none' });
    this.setData({ roundActionInput: '' });
    this.loadSettings();
  },
  removeRoundAction(e) {
    this.openDialog({ title: '移除快捷操作？', message: '已有待办不会受到影响。', confirmText: '移除', tone: 'danger', action: 'remove-round-action', payload: { id: e.currentTarget.dataset.id } });
  },
  add(e) {
    const category = e.currentTarget.dataset.category;
    const value = `${this.data.inputs[category] || ''}`.trim();
    if (!value) return wx.showToast({ title: '请输入名称', icon: 'none' });
    if (!addSettingItem(category, value)) return wx.showToast({ title: '已存在相同项目', icon: 'none' });
    this.setData({ [`inputs.${category}`]: '' });
    this.loadSettings();
  },
  remove(e) {
    const { category, value } = e.currentTarget.dataset;
    const section = this.data.sections.find((item) => item.key === category);
    if (category === 'departments' && section.items.length <= 1) return wx.showToast({ title: '请至少保留一个项目', icon: 'none' });
    if (category === 'procedures' && value === '未选择术式') return;
    this.openDialog({ title: '确认移除？', message: `“${value}”将不再出现在新建选项中，已有患者资料不会改变。`, confirmText: '移除', tone: 'danger', action: 'remove-setting', payload: { category, value } });
  },
  exportBackup() {
    const password = this.data.backupPassword;
    if (!password || password.length < 8) return wx.showToast({ title: '请先输入至少 8 位备份密码', icon: 'none' });
    this.openDialog({ title: '生成加密备份？', message: '【隐私】备份包含患者敏感资料。请妥善保管密码，不要发送给无关人员。', confirmText: '生成备份', tone: 'privacy', action: 'export-backup', payload: { password } });
  },
  verifyBackup() {
    const password = this.data.backupPassword;
    if (!password) return wx.showToast({ title: '请输入备份文件的密码', icon: 'none' });
    this.openDialog({ title: '校验加密备份', message: '【隐私】仅在本机读取、解密并校验备份结构，不会恢复、覆盖或发送数据。', confirmText: '选择文件', tone: 'privacy', action: 'choose-verify-backup', payload: { password } });
  },
  shareBackup() {
    if (!this.data.backupPath) return;
    this.openDialog({ title: '离开本机前再次确认', message: '下一步会打开微信文件分享界面，但不会自动发送。备份已加密，仍应只保存到你本人控制的位置。', confirmText: '打开分享', tone: 'privacy', action: 'share-backup', payload: { filePath: this.data.backupPath } });
  },
  importBackup() {
    const password = this.data.backupPassword;
    if (!password) return wx.showToast({ title: '请输入备份文件的密码', icon: 'none' });
    this.openDialog({ title: '选择加密备份', message: '【隐私】仅选择由本工作板生成的 .dhwb 文件。读取和恢复均在本机完成。', confirmText: '选择文件', tone: 'privacy', action: 'choose-import-backup', payload: { password } });
  },
  confirmDialog() {
    if (this.data.dialog.action === 'dismiss') return this.setData({ dialog: emptyDialog() });
    if (this.dialogBusy || this.data.dialog.loading) return;
    const { action, payload } = this.data.dialog;
    this.dialogBusy = true;
    this.setData({ 'dialog.loading': true });
    if (action === 'export-backup') return this.performExportBackup(payload.password);
    if (action === 'choose-verify-backup') { this.finishDialog(); return this.chooseBackupForVerification(payload.password); }
    if (action === 'choose-import-backup') { this.finishDialog(); return this.chooseBackupForImport(payload.password); }
    if (action === 'share-backup') {
      this.finishDialog();
      return wx.shareFileMessage({ filePath: payload.filePath, fileName: '代寰宇的工作板加密备份.dhwb', fail: () => wx.showToast({ title: '当前环境不支持文件分享', icon: 'none' }) });
    }
    let result = { ok: true };
    if (action === 'remove-ward') result = removeDepartmentWard(this.data.wardDepartment, payload.ward);
    if (action === 'remove-round-action') removeRoundActionTemplate(payload.id);
    if (action === 'remove-setting') result = removeSettingItem(payload.category, payload.value);
    if (action === 'restore-previous') result = restorePreviousWorkspace();
    if (action === 'restore-revoked') result = restoreRevokedRegistration(payload.id);
    if (action === 'restore-import') {
      try {
        if (!this.pendingImport) throw new Error('待恢复数据已失效，请重新选择备份');
        restoreWorkspace(this.pendingImport.workspace, { allowDateWarnings: true });
        result = { ok: true, migrated: this.pendingImport.migrated };
        this.pendingImport = null;
      } catch (error) {
        result = { ok: false, error: error.message || '备份结构不完整' };
      }
    }
    if (!result || !result.ok) return this.failDialog(action === 'restore-import' ? '恢复失败' : action === 'restore-previous' ? '回退失败' : '操作失败', (result && result.error) || '操作未完成');
    this.finishDialog();
    this.loadSettings();
    const successTitle = action === 'restore-previous' ? '已回退至恢复前状态' : action === 'restore-revoked' ? '已恢复建档' : action === 'restore-import' ? (result.migrated ? '旧版数据已迁移并恢复' : '数据已恢复') : '已移除';
    wx.showToast({ title: successTitle, icon: 'success' });
  },
  async performExportBackup(password) {
    this.setData({ dialog: emptyDialog() });
    wx.showLoading({ title: '正在加密', mask: true });
    try {
      const content = await encryptBackup(getWorkspace(), password);
      const verified = decryptBackup(content, password);
      const filePath = `${wx.env.USER_DATA_PATH}/工作板备份-${Date.now()}.dhwb`;
      wx.getFileSystemManager().writeFileSync(filePath, content, 'utf8');
      recordBackupVerification('export', getBackupSummary(verified));
      this.setData({ backupPath: filePath });
      this.loadSettings();
      wx.showToast({ title: '备份已生成并校验', icon: 'success' });
    } catch (error) {
      this.showInfo('备份失败', error.message || '无法生成备份');
    } finally {
      this.dialogBusy = false;
      wx.hideLoading();
    }
  },
  chooseBackupForVerification(password) {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['dhwb'],
      success: (selection) => {
        wx.showLoading({ title: '正在校验', mask: true });
        try {
          const content = wx.getFileSystemManager().readFileSync(selection.tempFiles[0].path, 'utf8');
          const backup = decryptBackup(content, password);
          const summary = getBackupSummary(backup);
          let recoveryNote = '';
          try {
            const imported = prepareBackupImport(backup, { allowDateWarnings: true });
            recoveryNote = imported.dateWarning ? `发现既往日期异常：${imported.dateWarning}。备份可用；恢复时会再次提示确认。` : '恢复前检查通过。';
          } catch (error) {
            recoveryNote = `备份加密校验通过，但恢复前检查提示：${error.message || '数据关联不完整'}`;
          }
          recordBackupVerification('file-check', summary);
          this.loadSettings();
          this.showInfo('备份加密校验通过', `在院 ${summary.activePatients} 人，归档 ${summary.archivedPatients} 人，撤销建档 ${summary.revokedPatients} 条。${recoveryNote}`);
        } catch (error) {
          this.showInfo('备份校验失败', error.message || '密码错误、文件损坏或关联不完整');
        } finally {
          wx.hideLoading();
        }
      },
      fail: (error) => { if (!/cancel/i.test(error.errMsg || '')) this.showInfo('无法选择备份', error.errMsg || '文件选择失败'); },
    });
  },
  chooseBackupForImport(password) {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['dhwb'],
      success: (selection) => {
        wx.showLoading({ title: '正在验证', mask: true });
        try {
          const content = wx.getFileSystemManager().readFileSync(selection.tempFiles[0].path, 'utf8');
          const imported = prepareBackupImport(decryptBackup(content, password), { allowDateWarnings: true });
          const summary = getBackupSummary(imported.workspace);
          this.pendingImport = imported;
          this.openDialog({ title: '确认恢复此备份？', message: `来源数据 v${imported.sourceSchemaVersion}${imported.migrated ? `，将迁移至 v${imported.targetSchemaVersion}` : ''}。在院 ${summary.activePatients} 人，归档 ${summary.archivedPatients} 人，查房 ${summary.rounds} 条。${imported.dateWarning ? `发现既往日期异常：${imported.dateWarning}；仍可恢复，后续请核对修正。` : ''}恢复前会自动保留当前数据快照。`, confirmText: '确认恢复', tone: 'warning', action: 'restore-import' });
        } catch (error) {
          this.showInfo('无法读取备份', error.message || '密码错误或文件已损坏');
        } finally {
          wx.hideLoading();
        }
      },
      fail: (error) => { if (!/cancel/i.test(error.errMsg || '')) this.showInfo('无法选择备份', error.errMsg || '文件选择失败'); },
    });
  },
  restorePreviousWorkspace() {
    const snapshot = this.data.restoreSnapshot;
    if (!snapshot) return wx.showToast({ title: '暂无可回退的恢复前快照', icon: 'none' });
    this.openDialog({ title: '回退至恢复前状态？', message: `将恢复 ${snapshot.savedAtText || '最近一次'} 自动快照（在院 ${snapshot.activePatients} 人、归档 ${snapshot.archivedPatients} 人）。当前数据会自动成为新的回退快照。`, confirmText: '确认回退', tone: 'warning', action: 'restore-previous' });
  },
  restoreRevokedRegistration(e) {
    const item = this.data.revokedRegistrations.find((entry) => entry.id === e.currentTarget.dataset.id);
    if (!item) return;
    if (!item.restorable) return this.showInfo('暂不能恢复', '当前已存在相同住院号，请先核对在院或归档记录。');
    this.openDialog({ title: '恢复撤销建档？', message: `将恢复该患者及 ${item.recordCount} 条本地关联记录，不会发送或覆盖其他患者资料。`, confirmText: '确认恢复', action: 'restore-revoked', payload: { id: item.id } });
  },
});
