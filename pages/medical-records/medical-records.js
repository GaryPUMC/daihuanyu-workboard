import { getMedicalRecordBoard, getPrivacyMaskEnabled, getWorkspace, maskPatient, setMedicalRecordRequirementDone, setPrivacyMaskEnabled, todayKey } from '../../utils/workspace-store';

function displayedRows(rows, viewMode) {
  if (viewMode === 'pending') return rows.filter((item) => item.hasPending);
  if (viewMode === 'discharged') return rows.filter((item) => item.discharged && item.hasPending);
  return rows.filter((item) => !item.discharged);
}

Page({
  data: {
    privacyVisible: true,
    activeDepartment: '',
    today: '',
    viewMode: 'active',
    podColumns: [],
    patients: [],
    tableWidth: 0,
    summary: { pending: 0, severe: 0, overdue: 0, today: 0, dischargeWindow: 0 },
  },
  onShow() {
    this.setData({ privacyVisible: !getPrivacyMaskEnabled() });
    this.loadBoard();
  },
  loadBoard() {
    const workspace = getWorkspace();
    const activeDepartment = workspace.settings.activeDepartment;
    const board = getMedicalRecordBoard(todayKey(), workspace, activeDepartment);
    const patients = displayedRows(board.patients, this.data.viewMode).map((patient) => {
      const masked = maskPatient(patient, workspace.settings.departmentWards);
      return {
        ...patient,
        displayName: this.data.privacyVisible ? patient.name : masked.displayName,
        locationLabel: masked.locationLabel,
        podText: `POD${patient.currentPod}`,
      };
    });
    this.setData({
      activeDepartment,
      today: board.referenceDate,
      podColumns: board.podColumns,
      patients,
      tableWidth: 176 + board.podColumns.length * 104 + 124,
      summary: board.summary,
    });
  },
  selectViewMode(e) {
    const viewMode = e.currentTarget.dataset.mode;
    if (!['active', 'pending', 'discharged'].includes(viewMode) || viewMode === this.data.viewMode) return;
    this.setData({ viewMode }, () => this.loadBoard());
  },
  togglePrivacy() {
    const privacyVisible = !this.data.privacyVisible;
    setPrivacyMaskEnabled(!privacyVisible);
    this.setData({ privacyVisible }, () => this.loadBoard());
  },
  toggleRequirement(e) {
    if (this.toggleBusy) return;
    const { patientId, requirementKey, actionable } = e.currentTarget.dataset;
    const done = e.currentTarget.dataset.done === true || e.currentTarget.dataset.done === 'true';
    if (!(actionable === true || actionable === 'true')) return;
    this.toggleBusy = true;
    const result = setMedicalRecordRequirementDone(patientId, requirementKey, !done);
    this.toggleBusy = false;
    if (!result.ok) return wx.showToast({ title: result.error || '保存失败', icon: 'none', duration: 2400 });
    const title = result.stillSatisfied
      ? `已撤销单独确认，仍由POD${result.remainingLinkedPod}满足`
      : done
        ? '已撤销病历完成'
        : result.linkedDischarge
          ? '已完成，同时满足出院病历'
          : '已标记病历完成';
    wx.showToast({ title, icon: 'none', duration: result.stillSatisfied ? 2800 : 2200 });
    this.loadBoard();
  },
});
