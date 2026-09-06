import { buildAdmissionPatient, getAdmissionImportGuide, parseAdmissionImport } from '../../utils/admission-import';
import { createPatientsAtomically, getWorkspace, todayKey } from '../../utils/workspace-store';
import { createDialog, emptyDialog } from '../../utils/ui-state';

function decorateCandidates(candidates) {
  return candidates.map((item) => ({ ...item, selectedLabel: item.selected ? '已纳入' : '已跳过' }));
}

function preserveSelections(nextCandidates, previousCandidates) {
  return nextCandidates.map((item, index) => {
    const previous = previousCandidates[index];
    const selected = !item.errors.length && (!previous || previous.errors.length ? true : previous.selected);
    return { ...item, selected, selectedLabel: selected ? '已纳入' : '已跳过' };
  });
}

Page({
  data: {
    activeDepartment: '', importGuide: '', inputText: '', candidates: [], parseError: '', summary: null, resultText: '',
    departments: [], departmentWards: {}, dialog: emptyDialog(),
  },
  onShow() {
    const workspace = getWorkspace();
    this.setData({ activeDepartment: workspace.settings.activeDepartment, departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, importGuide: getAdmissionImportGuide(todayKey()) });
  },
  inputText(e) { this.setData({ inputText: e.detail.value, parseError: '', resultText: '' }); },
  openDialog(config) { wx.hideKeyboard({ complete: () => this.setData({ dialog: createDialog(config) }) }); },
  copyImportGuide() {
    wx.setClipboardData({ data: this.data.importGuide, success: () => wx.showToast({ title: '整理格式已复制', icon: 'success' }) });
  },
  parseText() {
    const workspace = getWorkspace();
    const result = parseAdmissionImport(this.data.inputText, {
      today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
      departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
      existingPatients: [...workspace.patients, ...workspace.archivedPatients],
    });
    if (!result.ok) return this.setData({ candidates: [], summary: null, parseError: result.error });
    this.setData({ candidates: decorateCandidates(result.candidates), summary: result.summary, parseError: '', resultText: '' });
  },
  toggleCandidate(e) {
    const candidateId = e.currentTarget.dataset.id;
    const candidates = this.data.candidates.map((item) => {
      if (item.candidateId !== candidateId || item.errors.length) return item;
      const selected = !item.selected;
      return { ...item, selected, selectedLabel: selected ? '已纳入' : '已跳过' };
    });
    this.setData({ candidates });
  },
  openEditor(e) {
    const candidate = this.data.candidates.find((item) => item.candidateId === e.currentTarget.dataset.id);
    if (!candidate || candidate.statusTone === 'done') return;
    const workspace = getWorkspace();
    wx.navigateTo({
      url: '/pages/admission-candidate-edit/admission-candidate-edit',
      success: (res) => {
        res.eventChannel.emit('initCandidateEditor', {
          candidateId: candidate.candidateId, patient: candidate.patient, fieldErrors: candidate.fieldErrors,
          activeDepartment: workspace.settings.activeDepartment,
          departments: workspace.settings.departments,
          departmentWards: workspace.settings.departmentWards,
          firstAssistants: workspace.settings.firstAssistants,
          existingPatients: [...workspace.patients, ...workspace.archivedPatients].map((item) => ({ id: item.id })),
        });
        res.eventChannel.on('candidateUpdated', ({ candidateId, patient }) => this.applyCandidateUpdate(candidateId, patient));
      },
    });
  },
  applyCandidateUpdate(candidateId, patient) {
    const patients = this.data.candidates.map((item) => item.candidateId === candidateId ? patient : item.patient);
    const workspace = getWorkspace();
    const result = parseAdmissionImport(JSON.stringify({
      schema: 'workboard-admission-import/v1', department: this.data.activeDepartment, patients,
    }), {
      today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
      departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
      existingPatients: [...workspace.patients, ...workspace.archivedPatients],
    });
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.setData({
      candidates: preserveSelections(result.candidates, this.data.candidates), summary: result.summary,
      parseError: '', resultText: '',
    });
    wx.showToast({ title: '已更新并重新校验', icon: 'success' });
  },
  confirmImport() {
    const selected = this.data.candidates.filter((item) => item.selected && !item.errors.length);
    if (!selected.length) return wx.showToast({ title: '请至少纳入一位可导入患者', icon: 'none' });
    this.openDialog({ title: '确认录入拟入院患者', message: `将把 ${selected.length} 位患者保存到本机。预入院患者可暂不填写床位，系统将显示“待分配”。请核对住院号、性别和主刀医生。`, confirmText: '确认录入', action: 'confirm-import' });
  },
  closeDialog() { if (!this.data.dialog.loading) this.setData({ dialog: emptyDialog() }); },
  confirmDialog() {
    if (this.dialogBusy || this.data.dialog.loading) return;
    if (this.data.dialog.action === 'dismiss') return this.setData({ dialog: emptyDialog() });
    if (this.data.dialog.action !== 'confirm-import') return;
    const selected = this.data.candidates.filter((item) => item.selected && !item.errors.length);
    if (!selected.length) return this.setData({ dialog: emptyDialog() });
    this.dialogBusy = true;
    this.setData({ 'dialog.loading': true });
    const result = createPatientsAtomically(selected.map((candidate) => buildAdmissionPatient(candidate, todayKey())));
    this.dialogBusy = false;
    if (!result.ok) return this.setData({ dialog: createDialog({ title: '未录入任何患者', message: `${result.error}。请重新解析并核对后再确认。`, confirmText: '知道了', showCancel: false, action: 'dismiss' }) });
    const importedIds = new Set(result.patients.map((patient) => patient.id));
    const candidates = this.data.candidates.map((item) => importedIds.has(item.patient.id) ? { ...item, selected: false, selectedLabel: '已录入', statusLabel: '已录入', statusTone: 'done' } : item);
    this.setData({ candidates, inputText: '', resultText: `已原子录入 ${result.patients.length} 位；未产生部分写入。`, dialog: emptyDialog() });
    wx.showToast({ title: `已录入 ${result.patients.length} 位`, icon: 'success' });
  },
  clearImport() { this.setData({ inputText: '', candidates: [], parseError: '', summary: null, resultText: '' }); },
});
