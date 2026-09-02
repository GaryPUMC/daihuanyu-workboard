import { addRoundActionTask, getPatientStatus, getPOD, getPrivacyMaskEnabled, getWorkspace, isPostoperative, maskPatient, saveRound, setPrivacyMaskEnabled, todayKey } from '../../utils/workspace-store';
const PATIENT_TYPE_ORDER = { '日间': 0, '国疗': 1, '普通': 2 };

function emptyRoundEditor() {
  return { visible: false, patientId: '', patientName: '', roundId: '', createdAt: '', date: '', content: '', dirty: false, focus: false };
}

function isInHospitalForRounds(patient) {
  return getPatientStatus(patient) === '在院';
}

function compareRoundPatients(a, b) {
  const typeDiff = (PATIENT_TYPE_ORDER[a.patientType] ?? 99) - (PATIENT_TYPE_ORDER[b.patientType] ?? 99);
  if (typeDiff) return typeDiff;
  const wardDiff = `${a.ward || ''}`.localeCompare(`${b.ward || ''}`);
  if (wardDiff) return wardDiff;
  const bedA = Number((`${a.bed || ''}`.match(/\d+/) || ['999999'])[0]);
  const bedB = Number((`${b.bed || ''}`.match(/\d+/) || ['999999'])[0]);
  return bedA - bedB || `${a.name || ''}`.localeCompare(`${b.name || ''}`);
}

Page({
  data: { patients: [], actionTemplates: [], privacyVisible: true, viewMode: 'drain', allPatientCount: 0, drainPatientCount: 0, roundEditor: emptyRoundEditor(), editorKeyboardHeight: 0, roundSaveBusy: false },
  onLoad(options) { this.initialId = decodeURIComponent(options.id || ''); },
  onShow() { this.setData({ privacyVisible: !getPrivacyMaskEnabled() }); this.loadBoard(); },
  loadBoard() {
    const workspace = getWorkspace();
    const actionTemplates = workspace.settings.roundActionTemplates || [];
    const activeDepartment = workspace.settings.activeDepartment;
    const allInHospital = workspace.patients.filter((patient) => patient.department === activeDepartment && isInHospitalForRounds(patient));
    const drainPatients = allInHospital.filter((patient) => workspace.devices.some((item) => item.patientId === patient.id && item.type === 'drain' && item.status === 'active'));
    const sourcePatients = this.data.viewMode === 'drain' ? drainPatients : allInHospital;
    const patients = sourcePatients.map((patient) => {
      const masked = maskPatient(patient, workspace.settings.departmentWards);
      const pod = getPOD(patient.surgeryDate);
      const drains = workspace.devices.filter((item) => item.patientId === patient.id && item.type === 'drain' && item.status === 'active').map((device) => {
        const values = workspace.observations.filter((item) => item.deviceId === device.id && item.entryType !== 'removed').sort((a, b) => a.pod - b.pod);
        const latest = values[values.length - 1];
        return `${device.name} ${latest ? `POD${latest.pod} ${latest.value}mL` : '待记录'}`;
      });
      const postoperative = isPostoperative(patient);
      const actions = actionTemplates.filter((action) => {
        if (!postoperative && action.postoperativeOnly) return false;
        if (action.id === 'round-action-drain' && !drains.length) return false;
        return true;
      });
      const todayRound = workspace.rounds.filter((item) => item.patientId === patient.id && item.date === todayKey()).sort((a, b) => `${b.updatedAt || ''}`.localeCompare(`${a.updatedAt || ''}`))[0];
      return {
        ...patient, locationLabel: masked.locationLabel, genderClass: masked.genderClass, patientTypeClass: masked.patientTypeClass,
        displayName: this.data.privacyVisible ? patient.name : masked.displayName,
        displayId: this.data.privacyVisible ? patient.id : masked.displayId,
        podText: pod === null ? '' : pod < 0 ? `术前 ${Math.abs(pod)} 天` : `POD ${pod}`,
        openTaskCount: workspace.tasks.filter((item) => item.patientId === patient.id && item.status !== 'done').length,
        drainText: drains.join(' · ') || '无在位引流',
        postoperative, actions, careStatus: getPatientStatus(patient),
        hasTodayRound: Boolean(todayRound), roundSummary: todayRound ? todayRound.content : '',
      };
    }).sort(compareRoundPatients);
    if (this.initialId) patients.sort((a, b) => (a.id === this.initialId ? -1 : b.id === this.initialId ? 1 : 0));
    this.setData({ patients, actionTemplates, allPatientCount: allInHospital.length, drainPatientCount: drainPatients.length });
  },
  selectViewMode(e) {
    const viewMode = e.currentTarget.dataset.mode;
    if (!['drain', 'all'].includes(viewMode) || viewMode === this.data.viewMode) return;
    this.setData({ viewMode }, () => this.loadBoard());
  },
  togglePrivacy() { const privacyVisible = !this.data.privacyVisible; setPrivacyMaskEnabled(!privacyVisible); this.setData({ privacyVisible }, () => this.loadBoard()); },
  addAction(e) {
    const result = addRoundActionTask(e.currentTarget.dataset.patientId, e.currentTarget.dataset.actionId);
    wx.showToast({ title: result.ok ? '已加入今日待办' : result.error, icon: result.ok ? 'success' : 'none', duration: 2200 });
    if (result.ok) this.loadBoard();
  },
  openRoundEditor(e) {
    const patientId = e.currentTarget.dataset.patientId;
    const workspace = getWorkspace();
    const patient = workspace.patients.find((item) => item.id === patientId);
    if (!patient) return wx.showToast({ title: '未找到患者', icon: 'none' });
    const date = todayKey();
    const existing = workspace.rounds.filter((item) => item.patientId === patientId && item.date === date).sort((a, b) => `${b.updatedAt || ''}`.localeCompare(`${a.updatedAt || ''}`))[0];
    const masked = maskPatient(patient, workspace.settings.departmentWards);
    this.setData({ roundEditor: {
      visible: true, patientId, patientName: this.data.privacyVisible ? patient.name : masked.displayName,
      roundId: existing ? existing.id : '', createdAt: existing ? existing.createdAt : '', date,
      content: existing ? existing.content : '', dirty: false, focus: false,
    }, editorKeyboardHeight: 0, roundSaveBusy: false }, () => wx.nextTick(() => this.setData({ 'roundEditor.focus': true })));
  },
  inputRoundEditor(e) { this.setData({ [`roundEditor.${e.currentTarget.dataset.field}`]: e.detail.value, 'roundEditor.dirty': true }); },
  editorKeyboardChange(e) {
    const editorKeyboardHeight = Math.max(0, Number(e.detail.height) || 0);
    if (editorKeyboardHeight !== this.data.editorKeyboardHeight) this.setData({ editorKeyboardHeight });
  },
  closeRoundEditor() {
    if (!this.data.roundSaveBusy) this.setData({ roundEditor: emptyRoundEditor(), editorKeyboardHeight: 0 });
  },
  saveRoundEditor() {
    const editor = this.data.roundEditor;
    if (!`${editor.content || ''}`.trim()) return wx.showToast({ title: '请输入查房文字', icon: 'none' });
    if (this.data.roundSaveBusy) return;
    this.setData({ roundSaveBusy: true });
    const result = saveRound(editor.patientId, {
      id: editor.roundId, createdAt: editor.createdAt, date: editor.date,
      content: editor.content,
    });
    if (!result.ok) {
      this.setData({ roundSaveBusy: false });
      return wx.showToast({ title: result.error || '保存失败', icon: 'none' });
    }
    this.setData({ roundEditor: emptyRoundEditor(), editorKeyboardHeight: 0, roundSaveBusy: false });
    wx.showToast({ title: editor.roundId ? '已更新今日查房' : '已保存今日查房', icon: 'success' });
    this.loadBoard();
  },
  goPatient(e) { wx.navigateTo({ url: `/pages/patient-detail/patient-detail?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings' }); },
});
