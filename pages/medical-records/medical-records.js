import { getMedicalRecordBoard, getPrivacyMaskEnabled, getWorkspace, maskPatient, setMedicalRecordRequirementDone, setPrivacyMaskEnabled, todayKey } from '../../utils/workspace-store';
import { buildMedicalRecordPatientView, filterMedicalRecordRows, summarizeMedicalRecordRows } from '../../utils/medical-record-view';

Page({
  data: {
    privacyVisible: true,
    activeDepartment: '',
    today: '',
    viewMode: 'active',
    patients: [],
    expandedPatientId: '',
    recentlyCompletedPatientId: '',
    summary: { pending: 0, severe: 0, overdue: 0, today: 0, dischargeWindow: 0 },
  },
  onShow() {
    this.setData({ privacyVisible: !getPrivacyMaskEnabled() });
    this.loadBoard();
  },
  loadBoard(done) {
    const workspace = getWorkspace();
    const activeDepartment = workspace.settings.activeDepartment;
    const board = getMedicalRecordBoard(todayKey(), workspace, activeDepartment);
    const patientViews = board.patients.map(buildMedicalRecordPatientView);
    const patients = filterMedicalRecordRows(patientViews, this.data.viewMode, this.data.recentlyCompletedPatientId).map((patient) => {
      const masked = maskPatient(patient, workspace.settings.departmentWards);
      return {
        ...patient,
        displayName: this.data.privacyVisible ? patient.name : masked.displayName,
        locationLabel: masked.locationLabel,
        podText: `POD${patient.currentPod}`,
        expanded: patient.id === this.data.expandedPatientId,
        completedJustNow: patient.id === this.data.recentlyCompletedPatientId && !patient.hasPending,
      };
    });
    this.setData({
      activeDepartment,
      today: board.referenceDate,
      patients,
      summary: summarizeMedicalRecordRows(patients),
    }, done);
  },
  clearRetentionTimer() {
    if (this.retentionTimer) clearTimeout(this.retentionTimer);
    this.retentionTimer = null;
  },
  selectViewMode(e) {
    const viewMode = e.currentTarget.dataset.mode;
    if (!['active', 'pending', 'discharged'].includes(viewMode) || viewMode === this.data.viewMode) return;
    this.clearRetentionTimer();
    this.setData({ viewMode, expandedPatientId: '', recentlyCompletedPatientId: '' }, () => this.loadBoard());
  },
  togglePrivacy() {
    const privacyVisible = !this.data.privacyVisible;
    setPrivacyMaskEnabled(!privacyVisible);
    this.setData({ privacyVisible }, () => this.loadBoard());
  },
  togglePatientTimeline(e) {
    const patientId = e.currentTarget.dataset.patientId;
    if (!patientId) return;
    const expandedPatientId = this.data.expandedPatientId === patientId ? '' : patientId;
    this.setData({ expandedPatientId }, () => this.loadBoard());
  },
  toggleRequirement(e) {
    if (this.toggleBusy) return;
    const { patientId, requirementKey, actionable } = e.currentTarget.dataset;
    const done = e.currentTarget.dataset.done === true || e.currentTarget.dataset.done === 'true';
    if (!(actionable === true || actionable === 'true')) return;
    this.toggleBusy = true;
    const result = setMedicalRecordRequirementDone(patientId, requirementKey, !done);
    if (!result.ok) {
      this.toggleBusy = false;
      return wx.showToast({ title: result.error || '保存失败', icon: 'none', duration: 2400 });
    }
    const title = result.stillSatisfied
      ? `已撤销单独确认，仍由POD${result.remainingLinkedPod}满足`
      : done
        ? '已撤销病历完成'
        : result.linkedDischarge
          ? '已完成，同时满足出院病历'
          : '已标记病历完成';
    wx.showToast({ title, icon: 'none', duration: result.stillSatisfied ? 2800 : 2200 });
    const shouldRetain = !done && ['pending', 'discharged'].includes(this.data.viewMode);
    this.clearRetentionTimer();
    this.setData({
      expandedPatientId: patientId,
      recentlyCompletedPatientId: shouldRetain ? patientId : '',
    }, () => {
      this.loadBoard(() => {
        this.toggleBusy = false;
        if (!shouldRetain) return;
        this.retentionTimer = setTimeout(() => {
          this.retentionTimer = null;
          if (this.data.recentlyCompletedPatientId !== patientId) return;
          this.setData({ recentlyCompletedPatientId: '' }, () => this.loadBoard());
        }, 3500);
      });
    });
  },
  onHide() {
    this.clearRetentionTimer();
    this.setData({ recentlyCompletedPatientId: '' });
  },
  onUnload() { this.clearRetentionTimer(); },
});
