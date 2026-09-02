import { getActiveTasks, getDischargeReadiness, getPrivacyMaskEnabled, getWorkspace, getPOD, maskPatient, setActiveDepartment, setPrivacyMaskEnabled, setTaskDone, taskBucket, todayKey } from '../../utils/workspace-store';
import { createDialog, emptyDialog } from '../../utils/ui-state';

function todayLabel() {
  const now = new Date(Date.now() + 8 * 60 * 60000);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${now.getUTCMonth() + 1}月${now.getUTCDate()}日 · ${weekdays[now.getUTCDay()]}`;
}

const PATIENT_TYPE_ORDER = { '日间': 0, '国疗': 1, '普通': 2 };

function compareHomePatients(a, b) {
  const typeDiff = (PATIENT_TYPE_ORDER[a.patientType] ?? 99) - (PATIENT_TYPE_ORDER[b.patientType] ?? 99);
  if (typeDiff) return typeDiff;
  const wardDiff = `${a.ward || ''}`.localeCompare(`${b.ward || ''}`);
  if (wardDiff) return wardDiff;
  const bedA = Number((`${a.bed || ''}`.match(/\d+/) || ['999999'])[0]);
  const bedB = Number((`${b.bed || ''}`.match(/\d+/) || ['999999'])[0]);
  return bedA - bedB || `${a.bed || ''}`.localeCompare(`${b.bed || ''}`) || `${a.name || ''}`.localeCompare(`${b.name || ''}`);
}

function inHospitalList(patient) {
  return patient.careStatus === '在院';
}

function clinicalAlertFlags(patient, date, listType) {
  if (listType === 'discharged' || patient.careStatus === '已出院') return { flags: [], highlightClass: '' };
  const flags = [];
  if (patient.surgeryDate === date && getPOD(patient.surgeryDate) !== 0) flags.push({ key: 'surgery', label: '今日手术', tone: 'surgery' });
  if (patient.actualDischargeDate === date) flags.push({ key: 'discharge', label: '今日出院', tone: 'discharge' });
  if (patient.admissionDate === date) flags.push({ key: 'admission', label: '新入院', tone: 'admission' });
  if (/待分配/.test(patient.locationLabel || '')) flags.push({ key: 'ward', label: patient.locationLabel, tone: 'ward' });
  const highlightClass = flags.some((item) => item.key === 'surgery') ? 'highlight-surgery' : flags.some((item) => item.key === 'discharge') ? 'highlight-discharge' : flags.some((item) => item.key === 'admission') ? 'highlight-admission' : '';
  return { flags, highlightClass };
}

function todayAction(patient, activeTasks, date) {
  if (patient.actualDischargeDate === date) return { label: '今日：已出院', tone: 'discharge' };
  if (patient.surgeryDate === date) return { label: '今日：手术', tone: 'surgery' };
  if (patient.admissionDate === date) return { label: '今日：新入院', tone: 'admission' };
  const nextTask = activeTasks.find((task) => task.patientId === patient.id);
  return nextTask ? { label: `今日：${nextTask.title}`, tone: 'routine' } : { label: '今日：常规查房', tone: 'routine' };
}

function nextDayKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
}

function isRadiotherapyCandidate(diagnosis) {
  return /瘢痕疙瘩|瘢痕瘤|keloid/i.test(diagnosis || '');
}

function isRadiotherapySchedule(patient, date) {
  if (!isRadiotherapyCandidate(patient.diagnosis)) return false;
  const targetDate = patient.patientType === '日间' ? date : nextDayKey(date);
  return patient.surgeryDate === targetDate;
}

function photoText(patient) {
  return `${patient.name} ${patient.age}/${patient.gender}，${patient.id}，${patient.diagnosis}，拟于${patient.surgeryDate}行${patient.surgeryName}。${patient.surgeon}/代寰宇`;
}

function radiotherapyText(patient) {
  return `${patient.name}，${patient.gender}，${patient.id}，${patient.diagnosis}，拟于${patient.surgeryDate}手术切除`;
}

function pptText(patient) {
  const shortName = `${patient.name || ''}`.trim().slice(0, 1);
  const gender = patient.gender === '女' ? 'F' : patient.gender === '男' ? 'M' : patient.gender;
  return `${shortName}*，${patient.age}/${gender}，诊断：${patient.diagnosis}\n拟行：${patient.confirmedSurgeryName}`;
}

function collectTodayCooperation(workspace, department, type, date) {
  const tomorrow = nextDayKey(date);
  const required = type === 'photo' ? ['name', 'age', 'gender', 'id', 'diagnosis', 'surgeryName', 'surgeon'] : type === 'ppt' ? ['name', 'age', 'gender', 'diagnosis', 'confirmedSurgeryName', 'surgeryNameConfirmedAt'] : ['name', 'gender', 'id', 'diagnosis', 'surgeryDate'];
  const candidates = workspace.patients.filter((patient) => patient.department === department && inHospitalList(maskPatient(patient, workspace.settings.departmentWards)) && (type === 'radiotherapy' ? isRadiotherapySchedule(patient, date) : patient.surgeryDate === tomorrow));
  const ready = candidates.filter((patient) => required.every((field) => `${patient[field] || ''}`.trim()));
  const missing = candidates.filter((patient) => !ready.includes(patient)).map((patient) => `${maskPatient(patient, workspace.settings.departmentWards).locationLabel} ${patient.name || '未命名'}`);
  const heading = type === 'photo' ? '老师好，申请明日手术患者拍照：' : type === 'ppt' ? '明日手术 PPT 患者信息：' : '老师您好，以下患者申请术后放疗：';
  const lines = ready.map((patient, index) => `${index + 1}. ${type === 'photo' ? photoText(patient) : type === 'ppt' ? pptText(patient) : radiotherapyText(patient)}`);
  return { candidateCount: candidates.length, readyCount: ready.length, missing, text: lines.length ? `${heading}\n${lines.join('\n')}` : '' };
}

function getHomeNavMetrics() {
  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    if (menu && menu.width && menu.height) {
      return {
        navTop: Math.max(0, menu.top),
        navHeight: Math.max(40, menu.height),
        navRightPadding: Math.max(24, windowInfo.windowWidth - menu.left + 12),
      };
    }
  } catch (error) {
    // 极旧基础库读取胶囊信息失败时使用紧凑回退值。
  }
  return { navTop: 24, navHeight: 44, navRightPadding: 24 };
}

function overviewPatient(patient, workspace, privacyVisible, date, listType, activeTasks) {
  const masked = maskPatient(patient, workspace.settings.departmentWards);
  const pod = getPOD(patient.surgeryDate);
  const tasks = activeTasks.filter((task) => task.patientId === patient.id).sort((a, b) => `${a.dueAt}`.localeCompare(`${b.dueAt}`));
  const alerts = clinicalAlertFlags(masked, date, listType);
  const action = todayAction(patient, activeTasks, date);
  return {
    ...masked,
    displayName: privacyVisible ? patient.name : masked.displayName,
    displayId: privacyVisible ? patient.id : masked.displayId,
    podText: pod === null ? '' : pod < 0 ? `术前 ${Math.abs(pod)} 天` : `POD ${pod}`,
    hasPod: pod !== null && pod >= 0,
    nextTask: tasks[0] ? tasks[0].title : '暂无未完成待办',
    alertFlags: alerts.flags,
    highlightClass: alerts.highlightClass,
    todayAction: action.label,
    actionTone: action.tone,
    assistantMissing: !`${patient.firstAssistant || ''}`.trim(),
  };
}

Page({
  data: {
    today: '', privacyVisible: true,
    navTop: 24, navHeight: 44, navRightPadding: 24,
    totalPatients: 0, preAdmissionCount: 0, dischargedCount: 0, taskGroups: [], patientSummary: [], preAdmissionSummary: [], dischargedPatients: [], dischargeFollowups: [], departments: [], departmentIndex: 0, activeDepartment: '',
    overview: { urgent: 0, overdue: 0, today: 0, upcoming: 0 }, todayPhotoCount: 0, todayPptCount: 0, todayRadiotherapyCount: 0, roundDrainCount: 0, dialog: emptyDialog(),
  },
  onLoad() {
    this.setData(getHomeNavMetrics());
  },
  onShow() {
    this.setData({ privacyVisible: !getPrivacyMaskEnabled() });
    this.loadDashboard();
  },
  loadDashboard() {
    const workspace = getWorkspace();
    const date = todayKey();
    const activeDepartment = workspace.settings.activeDepartment;
    const departmentPatients = workspace.patients.filter((patient) => patient.department === activeDepartment);
    const preAdmissionPatients = departmentPatients.filter((patient) => maskPatient(patient, workspace.settings.departmentWards).careStatus === '待入院').sort(compareHomePatients);
    const activePatients = departmentPatients.filter((patient) => inHospitalList(maskPatient(patient, workspace.settings.departmentWards))).sort(compareHomePatients);
    // “不在院”还包含待入院；出院区和归档待办只能接收已实际出院患者，避免预入院重复出现。
    const dischargedPatients = departmentPatients.filter((patient) => maskPatient(patient, workspace.settings.departmentWards).careStatus === '已出院').sort(compareHomePatients);
    const patientMap = {};
    activePatients.forEach((patient) => { patientMap[patient.id] = patient; });
    const activeTasks = getActiveTasks();
    const selectedPatients = activePatients;
    const patientSummary = selectedPatients.map((patient) => overviewPatient(patient, workspace, this.data.privacyVisible, date, 'active', activeTasks));
    const preAdmissionSummary = preAdmissionPatients.map((patient) => overviewPatient(patient, workspace, this.data.privacyVisible, date, 'pre-admission', activeTasks));
    const dischargedSummary = dischargedPatients.map((patient) => overviewPatient(patient, workspace, this.data.privacyVisible, date, 'discharged', activeTasks));
    const dischargeFollowups = dischargedPatients.map((patient) => {
      const overviewPatientData = overviewPatient(patient, workspace, this.data.privacyVisible, date, 'discharged', activeTasks);
      const readiness = getDischargeReadiness(patient, workspace);
      return { ...overviewPatientData, pendingLabels: readiness.pendingLabels, pendingCount: readiness.pendingLabels.length, noticeDone: readiness.noticeDone, readyToArchive: readiness.readyToArchive, actualDischargeDate: patient.actualDischargeDate };
    }).filter((patient) => !patient.readyToArchive);
    const tasks = activeTasks.filter((task) => patientMap[task.patientId]);
    const decoratedTasks = tasks.map((task) => {
      const patient = patientMap[task.patientId];
      const masked = maskPatient(patient, workspace.settings.departmentWards);
      const bucket = taskBucket(task, date);
      return {
        ...task, bucket, done: task.status === 'done',
        patientName: this.data.privacyVisible ? patient.name : masked.displayName,
        patientCode: this.data.privacyVisible ? patient.id : masked.displayId,
        locationLabel: masked.locationLabel,
        level: task.priority === '重要' ? '重要' : task.category,
        levelClass: task.priority === '重要' ? 'danger' : bucket === 'overdue' ? 'warning' : 'normal',
        dueText: bucket === 'overdue' ? `已逾期 · ${task.dueAt.slice(0, 10)}` : bucket === 'today' ? '今日' : task.dueAt.slice(0, 10),
      };
    }).sort((a, b) => `${a.dueAt}${a.priority === '重要' ? '0' : '1'}`.localeCompare(`${b.dueAt}${b.priority === '重要' ? '0' : '1'}`));
    const groupDefinitions = [
      { key: 'overdue', title: '已逾期', tone: 'overdue' },
      { key: 'today', title: '今日处理', tone: 'today' },
      { key: 'upcoming', title: '即将到期', tone: 'upcoming' },
    ];
    const taskGroups = groupDefinitions.map((group) => ({ ...group, tasks: decoratedTasks.filter((task) => task.bucket === group.key) }));
    const allTasks = activeTasks.filter((task) => patientMap[task.patientId]);
    const overview = {
      urgent: allTasks.filter((task) => task.priority === '重要').length,
      overdue: allTasks.filter((task) => taskBucket(task, date) === 'overdue').length,
      today: allTasks.filter((task) => taskBucket(task, date) === 'today').length,
      upcoming: allTasks.filter((task) => taskBucket(task, date) === 'upcoming').length,
    };
    const photo = collectTodayCooperation(workspace, activeDepartment, 'photo', date);
    const ppt = collectTodayCooperation(workspace, activeDepartment, 'ppt', date);
    const radiotherapy = collectTodayCooperation(workspace, activeDepartment, 'radiotherapy', date);
    const roundDrainCount = activePatients.filter((patient) => workspace.devices.some((device) => device.patientId === patient.id && device.type === 'drain' && device.status === 'active')).length;
    this.setData({ today: todayLabel(), totalPatients: activePatients.length, preAdmissionCount: preAdmissionPatients.length, dischargedCount: dischargedPatients.length, taskGroups, patientSummary, preAdmissionSummary, dischargedPatients: dischargedSummary, dischargeFollowups, overview, todayPhotoCount: photo.readyCount, todayPptCount: ppt.readyCount, todayRadiotherapyCount: radiotherapy.readyCount, roundDrainCount, departments: workspace.settings.departments, departmentIndex: Math.max(0, workspace.settings.departments.indexOf(activeDepartment)), activeDepartment });
  },
  chooseDepartment(e) {
    const department = this.data.departments[Number(e.detail.value)];
    if (department && setActiveDepartment(department)) this.loadDashboard();
  },
  togglePrivacy() { const privacyVisible = !this.data.privacyVisible; setPrivacyMaskEnabled(!privacyVisible); this.setData({ privacyVisible }, () => this.loadDashboard()); },
  openDialog(config) { wx.hideKeyboard({ complete: () => this.setData({ dialog: createDialog(config) }) }); },
  previewTodayCooperation(e) {
    const type = e.currentTarget.dataset.type;
    if (!['photo', 'ppt', 'radiotherapy'].includes(type)) return;
    const workspace = getWorkspace();
    const result = collectTodayCooperation(workspace, workspace.settings.activeDepartment, type, todayKey());
    if (!result.candidateCount) return wx.showToast({ title: type === 'photo' ? '暂无明日手术需拍照患者' : type === 'ppt' ? '暂无明日手术 PPT 患者' : '暂无符合手术时机的需放疗患者', icon: 'none' });
    if (!result.text) return this.openDialog({ title: '暂不能生成文本', message: `请先补全以下患者资料：${result.missing.join('、')}`, confirmText: '知道了', showCancel: false, action: 'dismiss' });
    const incompleteNote = result.missing.length ? `\n\n以下 ${result.missing.length} 位资料不全，未纳入：${result.missing.join('、')}` : '';
    this.pendingCooperationText = result.text;
    this.openDialog({ title: type === 'photo' ? `核对拍照文本（${result.readyCount} 位）` : type === 'ppt' ? `核对 PPT 文本（${result.readyCount} 位）` : `核对放疗文本（${result.readyCount} 位）`, message: `${result.text}${incompleteNote}`, confirmText: '确认复制', selectable: true, action: 'copy-cooperation' });
  },
  closeDialog() { if (!this.data.dialog.loading) this.setData({ dialog: emptyDialog() }); },
  confirmDialog() {
    if (this.data.dialog.action === 'dismiss') return this.setData({ dialog: emptyDialog() });
    if (this.dialogBusy || this.data.dialog.loading || this.data.dialog.action !== 'copy-cooperation') return;
    this.dialogBusy = true;
    this.setData({ 'dialog.loading': true });
    wx.setClipboardData({
      data: this.pendingCooperationText || '',
      success: () => { this.dialogBusy = false; this.setData({ dialog: emptyDialog() }); wx.showToast({ title: '文本已复制，请自行核对后发送', icon: 'none', duration: 2400 }); },
      fail: () => { this.dialogBusy = false; this.setData({ 'dialog.loading': false }); wx.showToast({ title: '复制失败，请重试', icon: 'none' }); },
    });
  },
  completeTask(e) {
    const patientId = e.currentTarget.dataset.patientId;
    const taskId = e.currentTarget.dataset.id;
    const result = setTaskDone(patientId, taskId, true);
    if (result.ok) {
      wx.showToast({ title: '已完成', icon: 'success' });
      this.loadDashboard();
    } else wx.showToast({ title: result.error, icon: 'none', duration: 2400 });
  },
  goPatients() { wx.navigateTo({ url: '/pages/patients/patients' }); },
  goPatient(e) { wx.navigateTo({ url: `/pages/patient-detail/patient-detail?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  openTaskPatient(e) { this.goPatient(e); },
  goRounds() { wx.navigateTo({ url: '/pages/rounds/rounds' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings' }); },
});
