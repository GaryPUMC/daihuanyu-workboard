import { addDepartmentWard, addSettingItem, archiveDepartment, deleteDepartmentPermanently, getDepartmentUsage, getWorkspace, moveDepartment, moveDepartmentWard, removeDepartmentWard, removeSettingItem, restoreDepartment } from '../../utils/workspace-store';
import { createDialog, emptyDialog } from '../../utils/ui-state';

Page({
  data: {
    activeTab: 'departments', departmentRows: [], archivedDepartmentRows: [], departmentInput: '',
    departments: [], wardDepartment: '', wardDepartmentIndex: 0, wardRows: [], wardInput: '',
    dialog: emptyDialog(),
  },
  onShow() { this.loadManager(); },
  loadManager() {
    const workspace = getWorkspace();
    const departments = workspace.settings.departments;
    const wardDepartment = departments.includes(this.data.wardDepartment) ? this.data.wardDepartment : workspace.settings.activeDepartment;
    const wardDepartmentIndex = Math.max(0, departments.indexOf(wardDepartment));
    const configuredWards = workspace.settings.departmentWards[wardDepartment] || [];
    const row = (name, index, isArchived = false) => {
      const usage = getDepartmentUsage(name);
      return {
        name,
        number: index + 1,
        isActive: name === workspace.settings.activeDepartment,
        isArchived,
        canMoveUp: !isArchived && index > 0,
        canMoveDown: !isArchived && index < departments.length - 1,
        canArchive: !isArchived && name !== workspace.settings.activeDepartment,
        usageText: usage.totalPatients ? `关联 ${usage.totalPatients} 位患者` : '无关联患者',
      };
    };
    this.setData({
      departments,
      wardDepartment,
      wardDepartmentIndex,
      wardRows: configuredWards.map((name, index) => ({ name, number: index + 1, canMoveUp: index > 0, canMoveDown: index < configuredWards.length - 1 })),
      departmentRows: departments.map((name, index) => row(name, index)),
      archivedDepartmentRows: (workspace.settings.archivedDepartments || []).map((name, index) => row(name, index, true)),
    });
  },
  selectTab(e) {
    const activeTab = e.currentTarget.dataset.tab;
    if (!['departments', 'wards'].includes(activeTab) || activeTab === this.data.activeTab) return;
    this.setData({ activeTab });
  },
  inputDepartment(e) { this.setData({ departmentInput: e.detail.value }); },
  inputWard(e) { this.setData({ wardInput: e.detail.value }); },
  addDepartment() {
    const name = `${this.data.departmentInput || ''}`.trim();
    if (!name) return wx.showToast({ title: '请输入科室名称', icon: 'none' });
    if (!addSettingItem('departments', name)) return wx.showToast({ title: '已存在同名科室', icon: 'none' });
    this.setData({ departmentInput: '' }, () => this.loadManager());
  },
  move(e) {
    const { department, direction } = e.currentTarget.dataset;
    if (moveDepartment(department, direction)) this.loadManager();
  },
  removeDepartment(e) {
    const department = e.currentTarget.dataset.department;
    const source = e.currentTarget.dataset.source || 'active';
    const isActive = e.currentTarget.dataset.active === true || e.currentTarget.dataset.active === 'true';
    if (isActive) return wx.showToast({ title: '请先切换当前工作科室，再移除', icon: 'none' });
    if (source === 'active' && this.data.departments.length <= 1) return wx.showToast({ title: '请至少保留一个在用科室', icon: 'none' });
    const usage = getDepartmentUsage(department);
    const usageText = `在院 ${usage.activePatients} 位、归档 ${usage.archivedPatients} 位、回收站 ${usage.revokedPatients} 位`;
    if (usage.totalPatients || source === 'archived') {
      return this.openDialog({ title: '删除科室及关联资料？', message: `“${department}”${usage.totalPatients ? `含${usageText}。` : ''}这将永久删除该科室、病房配置及全部关联患者资料，且无法恢复。是否继续？`, confirmText: '继续', tone: 'danger', action: 'confirm-force-delete', payload: { department } });
    }
    this.openDialog({ title: '移除科室？', message: `“${department}”将不再出现在新建选项中；该科室的病房配置也会同时移除。`, confirmText: '移除', tone: 'danger', action: 'remove-department', payload: { department } });
  },
  archiveDepartment(e) {
    const { department, active } = e.currentTarget.dataset;
    if (active === true || active === 'true') return wx.showToast({ title: '请先切换当前工作科室，再归档', icon: 'none' });
    this.openDialog({ title: '归档科室？', message: `“${department}”将不再出现在新建和切换选项中，但患者、病房及本地历史资料都会保留，可随时恢复。`, confirmText: '归档', action: 'archive-department', payload: { department } });
  },
  restoreArchivedDepartment(e) {
    const result = restoreDepartment(e.currentTarget.dataset.department);
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.loadManager();
    wx.showToast({ title: '已恢复科室', icon: 'success' });
  },
  chooseWardDepartment(e) {
    const wardDepartment = this.data.departments[Number(e.detail.value)] || '';
    this.setData({ wardDepartment, wardInput: '' }, () => this.loadManager());
  },
  addWard() {
    const result = addDepartmentWard(this.data.wardDepartment, `${this.data.wardInput || ''}`.trim());
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.setData({ wardInput: '' }, () => this.loadManager());
  },
  moveWard(e) {
    const { ward, direction } = e.currentTarget.dataset;
    if (moveDepartmentWard(this.data.wardDepartment, ward, direction)) this.loadManager();
  },
  removeWard(e) {
    const ward = e.currentTarget.dataset.ward;
    this.openDialog({ title: '移除病房？', message: `“${ward}”不再用于新建或导入。已有患者不会被自动改动。`, confirmText: '移除', tone: 'danger', action: 'remove-ward', payload: { ward } });
  },
  openDialog(config) { wx.hideKeyboard({ complete: () => this.setData({ dialog: createDialog(config) }) }); },
  closeDialog() { if (!this.data.dialog.loading) this.setData({ dialog: emptyDialog() }); },
  confirmDialog() {
    if (this.data.dialog.action === 'dismiss') return this.setData({ dialog: emptyDialog() });
    if (this.dialogBusy || this.data.dialog.loading) return;
    const { action, payload } = this.data.dialog;
    if (action === 'confirm-force-delete') return this.setData({ dialog: createDialog({ title: '再次确认永久删除？', message: `“${payload.department}”及其病房配置、全部关联患者资料将被永久删除，无法恢复。`, confirmText: '永久删除', tone: 'danger', action: 'force-delete-department', payload }) });
    this.dialogBusy = true;
    this.setData({ 'dialog.loading': true });
    const result = action === 'remove-department'
      ? removeSettingItem('departments', payload.department)
      : action === 'force-delete-department'
        ? deleteDepartmentPermanently(payload.department)
        : action === 'archive-department'
          ? archiveDepartment(payload.department)
      : action === 'remove-ward'
        ? removeDepartmentWard(this.data.wardDepartment, payload.ward)
        : { ok: false, error: '未识别的操作' };
    this.dialogBusy = false;
    if (!result || !result.ok) {
      this.setData({ dialog: createDialog({ title: '操作失败', message: (result && result.error) || '操作未完成', confirmText: '知道了', showCancel: false, action: 'dismiss' }) });
      return;
    }
    this.setData({ dialog: emptyDialog() }, () => this.loadManager());
    wx.showToast({ title: action === 'archive-department' ? '已归档' : '已移除', icon: 'success' });
  },
});
