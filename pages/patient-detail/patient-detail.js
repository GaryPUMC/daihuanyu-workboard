import {
  addClinicalEvent, addDrain, addSettingItem, addTask, archivePatient, confirmSurgeryName, dischargePatient,
  formatBeijingDateTime, getDepartmentWards, getPatient, getPatientBundle, getPOD, getPrivacyMaskEnabled, getWorkspace, isDrainPeriod, isIntraoperativeOrLater, maskPatient,
  ensureDrainRowCount, recordDrainVolume, removeDrain, revertPatientDischarge, revokePatientRegistration, setPrivacyMaskEnabled, setTaskDone, todayKey, updatePatient,
} from '../../utils/workspace-store';
import { createDialog, emptyDialog } from '../../utils/ui-state';
import { preparePatientDraft, validatePatientDraft } from '../../utils/patient-draft';

const CUSTOM_PROCEDURE_OPTION = '＋ 自定义新术式';
const CUSTOM_ASSISTANT_OPTION = '其他（手动填写）';
const ALLERGY_OPTIONS = [
  { value: 'unknown', label: '未核实' }, { value: 'none', label: '无' }, { value: 'present', label: '有' },
];
const EVENT_LABELS = { 'drain-status': '引流', 'patient-revision': '资料修改' };
const VALUE_LABELS = { active: '在位', removed: '已拔除' };

function wardFormState(department, departmentWards, ward = '') {
  const wardOptions = getDepartmentWards(department, { departmentWards });
  const selectedWard = wardOptions.length === 1 ? wardOptions[0] : (wardOptions.includes(ward) ? ward : '');
  return { wardOptions, ward: selectedWard, wardIndex: Math.max(0, wardOptions.indexOf(selectedWard)) };
}

function missingFields(patient, fields) {
  return fields.filter((field) => !`${patient[field] || ''}`.trim());
}

function appointmentText(patient, type) {
  if (type === 'discharge-notice') return dischargeNoticeText(patient);
  const surgeryName = patient.confirmedSurgeryName || patient.surgeryName;
  const surgerySchedule = patient.surgeryDate ? `拟于${patient.surgeryDate}行${surgeryName}` : `拟行${surgeryName}`;
  if (type === 'photo') {
    return `老师好，申请拍照\n${patient.name} ${patient.age}/${patient.gender}，${patient.id}，${patient.diagnosis}，${surgerySchedule}。${patient.surgeon}/代寰宇`;
  }
  if (type === 'surgery-summary') {
    const shortName = `${patient.name || ''}`.trim().slice(0, 1);
    const gender = patient.gender === '女' ? 'F' : patient.gender === '男' ? 'M' : patient.gender;
    return `${shortName}*，${patient.age}/${gender}，诊断：${patient.diagnosis}\n拟行：${surgeryName}`;
  }
  return `老师您好，${patient.name}，${patient.gender}，${patient.id}，${patient.diagnosis}，${patient.surgeryDate ? `拟于${patient.surgeryDate}手术切除` : '拟手术切除'}，申请术后放疗`;
}

function appointmentTitle(type) {
  if (type === 'discharge-notice') return '核对出院通知';
  if (type === 'surgery-summary') return '核对 PPT 患者信息模板';
  return type === 'photo' ? '核对拍照预约文本' : '核对放疗预约文本';
}

function dischargeNoticeText(patient) {
  return `${patient.firstAssistant}老师您好，【${patient.patientType}】出院病人${patient.name}（${patient.id}）于${patient.actualDischargeDate}出院，现病历已经整理完毕，请您审核、修改并提交，谢谢。`;
}

function isRadiotherapyCandidate(diagnosis) {
  return /瘢痕疙瘩|瘢痕瘤|keloid/i.test(diagnosis || '');
}

function isRadiotherapySchedule(patient) {
  if (!isRadiotherapyCandidate(patient.diagnosis)) return false;
  const today = todayKey();
  const [year, month, day] = today.split('-').map(Number);
  const tomorrowDate = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${`${tomorrowDate.getUTCMonth() + 1}`.padStart(2, '0')}-${`${tomorrowDate.getUTCDate()}`.padStart(2, '0')}`;
  return patient.surgeryDate === (patient.patientType === '日间' ? today : tomorrow);
}

function buildDrainTable(patient, currentPod) {
  const columns = (patient.devices || []).filter((device) => device.type === 'drain');
  const entries = (patient.observations || []).filter((item) => columns.some((device) => device.id === item.deviceId));
  const discharged = Boolean(patient.actualDischargeDate);
  const maxPod = Math.max(1, patient.drainRowCount || 0, currentPod > 0 ? currentPod : 1, ...entries.map((item) => Number(item.pod) || 1));
  const byCell = new Map(entries.map((item) => [`${item.deviceId}:${item.pod}`, item]));
  return {
    columns: columns.map((device) => ({ ...device, canDelete: !entries.some((item) => item.deviceId === device.id) })),
    activeColumnCount: columns.filter((device) => device.status === 'active').length,
    width: 156 + columns.length * 168,
    rows: Array.from({ length: maxPod }, (_, index) => {
      const pod = index + 1;
      return {
        pod,
        cells: columns.map((device) => {
          const entry = byCell.get(`${device.id}:${pod}`);
          const removal = entries.find((item) => item.deviceId === device.id && item.entryType === 'removed');
          return {
            deviceId: device.id, deviceName: device.name, pod,
            text: entry ? (entry.entryType === 'removed' ? '拔' : `${entry.value} mL`) : '记录',
            entryType: entry ? entry.entryType : '', value: entry && entry.entryType === 'volume' ? `${entry.value}` : '',
            editable: !discharged && (device.status === 'active' || (removal && pod <= removal.pod)),
          };
        }),
      };
    }),
  };
}

function completeAppointmentTask(patientId, type) {
  const labelMap = { photo: '拍照预约文本', radiotherapy: '放疗预约文本', 'surgery-summary': 'PPT 患者信息模板' };
  if (!labelMap[type]) return false;
  return addClinicalEvent(patientId, `cooperation-${type}`, `已复制${labelMap[type]}`).ok;
}

Page({
  data: { patient: null, privacyVisible: true, newTask: '', taskCategories: [], taskCategoryIndex: 0, taskPriorities: ['普通', '重要'], taskPriorityIndex: 0, archived: false, intraoperative: false, postoperative: false, drains: [], drainTable: { columns: [], rows: [], width: 156 }, intraopAssistantOptions: [], intraopAssistantIndex: 0, clinicalEvents: [], revisionEvents: [], appointmentTypes: [], editing: false, editForm: {}, editErrors: {}, editIncomplete: false, dischargeDateInput: '', departments: [], departmentWards: {}, activeDepartment: '', departmentIndex: 0, wardOptions: [], wardIndex: 0, procedures: [], procedureOptions: [], procedureIndex: 0, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false, conditionOptions: [], editConditions: [], genders: ['男', '女'], patientTypes: ['普通', '国疗', '日间'], allergyOptions: ALLERGY_OPTIONS, firstAssistants: [], firstAssistantOptions: [], firstAssistantIndex: 0, customAssistantMode: false, customAssistant: '', addCustomAssistantToLibrary: false, editor: { visible: false, title: '', description: '', placeholder: '', content: '', kind: '', drainId: '', pod: 0, confirmText: '保存', warningConfirmed: false, warningText: '', dirty: false, focus: false }, editorKeyboardHeight: 0, editorSaveBusy: false, dialog: emptyDialog() },
  onLoad(options) { this.patientId = decodeURIComponent(options.id || ''); },
  onShow() {
    this.setData({ privacyVisible: !getPrivacyMaskEnabled() });
    this.loadPatient();
  },
  loadPatient() {
    const original = getPatientBundle(this.patientId);
    const workspace = getWorkspace();
    if (!original) return wx.showToast({ title: '未找到患者', icon: 'none' });
    const masked = maskPatient(original, workspace.settings.departmentWards);
    const displayPatient = this.data.privacyVisible ? { ...masked, displayName: original.name, displayId: original.id } : masked;
    const pod = getPOD(original.surgeryDate);
    const rounds = original.rounds.map((round) => ({ ...round, timeText: formatBeijingDateTime(round.createdAt).slice(11, 16) }));
    const tasks = original.tasks.map((task) => ({
      ...task, done: task.status === 'done', dueText: task.dueAt ? task.dueAt.slice(0, 10) : '未设置',
      priorityClass: task.priority === '重要' ? 'important' : '',
    }));
    const intraoperative = isIntraoperativeOrLater(original);
    const postoperative = isDrainPeriod(original) || (original.devices || []).some((device) => device.type === 'drain' && device.legacy);
    const drainTable = buildDrainTable(original, pod);
    const drains = drainTable.columns;
    const intraopAssistantOptions = ['未填写', ...workspace.settings.firstAssistants, CUSTOM_ASSISTANT_OPTION];
    const knownAssistantIndex = workspace.settings.firstAssistants.indexOf(original.firstAssistant);
    const intraopAssistantIndex = knownAssistantIndex >= 0 ? knownAssistantIndex + 1 : (original.firstAssistant ? intraopAssistantOptions.length - 1 : 0);
    const clinicalEvents = (original.clinicalEvents || []).filter((item) => EVENT_LABELS[item.type]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10).map((item) => {
      const statusText = VALUE_LABELS[item.value] || item.value;
      return { ...item, typeLabel: EVENT_LABELS[item.type], valueLabel: `${item.note ? `${item.note} · ` : ''}${statusText}`, timeText: formatBeijingDateTime(item.at) };
    });
    const revisionEvents = (original.clinicalEvents || []).filter((item) => item.type === 'patient-revision').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((item) => ({ ...item, timeText: formatBeijingDateTime(item.at) }));
    const surgeryConfirmation = original.department === '整形外科' ? {
      done: Boolean(original.confirmedSurgeryName && original.surgeryNameConfirmedAt),
      confirmedSurgeryName: original.confirmedSurgeryName || '',
    } : null;
    const appointmentTypes = original.archived ? [] : [
      ...(original.department === '整形外科' && !original.actualDischargeDate ? [
      { type: 'photo', title: '生成拍照预约文本', desc: '手术日期为明日时可复制；复制后自行核对并发送', done: (original.clinicalEvents || []).some((item) => item.type === 'cooperation-photo') },
      { type: 'surgery-summary', title: '生成 PPT 患者信息模板', desc: original.surgeryNameConfirmedAt && original.confirmedSurgeryName ? '简略姓名与已确认术式' : '完成主刀术式确认后可生成', done: (original.clinicalEvents || []).some((item) => item.type === 'cooperation-surgery-summary' || item.type === 'ppt-copy') },
      ...(isRadiotherapySchedule(original) ? [{ type: 'radiotherapy', title: '生成放疗预约文本', desc: original.patientType === '日间' ? '日间手术当日可复制；复制后自行核对并发送' : '明日手术可复制；复制后自行核对并发送', done: (original.clinicalEvents || []).some((item) => item.type === 'cooperation-radiotherapy') }] : []),
      ] : []),
      ...(original.actualDischargeDate ? [{ type: 'discharge-notice', title: '生成出院通知', desc: '请预览复制并自行发送；通知一助后再标记完成', done: (original.clinicalEvents || []).some((item) => item.type === 'cooperation-discharge-notice') }] : []),
    ];
    this.setData({
      patient: { ...displayPatient, rounds, tasks, generalTasks: tasks, surgeryConfirmation, surgeryNameConfirmed: Boolean(original.confirmedSurgeryName && original.surgeryNameConfirmedAt), confirmedSurgeryName: original.confirmedSurgeryName || '', podText: pod === null ? '' : pod < 0 ? `术前 ${Math.abs(pod)} 天` : `POD ${pod}` },
      archived: original.archived, intraoperative, postoperative, drains, drainTable, intraopAssistantOptions, intraopAssistantIndex, clinicalEvents, revisionEvents, appointmentTypes,
      dischargeDateInput: original.actualDischargeDate || (original.patientType === '日间' ? original.admissionDate : todayKey()),
      taskCategories: workspace.settings.taskCategories, taskCategoryIndex: Math.max(0, workspace.settings.taskCategories.indexOf(this.data.taskCategories[this.data.taskCategoryIndex]) >= 0 ? workspace.settings.taskCategories.indexOf(this.data.taskCategories[this.data.taskCategoryIndex]) : workspace.settings.taskCategories.indexOf('其他')),
    });
  },
  togglePrivacy() { const privacyVisible = !this.data.privacyVisible; setPrivacyMaskEnabled(!privacyVisible); this.setData({ privacyVisible }, () => this.loadPatient()); },
  startEdit() {
    if (this.data.archived) return;
    const patient = getPatient(this.patientId);
    const workspace = getWorkspace();
    if (!patient) return;
    const procedures = workspace.settings.procedures;
    const knownProcedureIndex = procedures.indexOf(patient.surgeryName || '未选择术式');
    const customProcedureMode = Boolean(patient.surgeryName) && knownProcedureIndex < 0;
    const firstAssistants = workspace.settings.firstAssistants;
    const assistantIndex = firstAssistants.indexOf(patient.firstAssistant);
    const draftValidation = validatePatientDraft(patient, { today: todayKey(), activeDepartment: workspace.settings.activeDepartment, departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, existingPatients: [...workspace.patients, ...workspace.archivedPatients], originalPatientId: this.patientId });
    const wards = { wardOptions: draftValidation.wardOptions, ward: draftValidation.value.ward, wardIndex: Math.max(0, draftValidation.wardOptions.indexOf(draftValidation.value.ward)) };
    this.setData({
      editing: true, editErrors: draftValidation.fieldErrors, editIncomplete: !draftValidation.ok || Boolean(patient.admissionStateNeedsReview), activeDepartment: workspace.settings.activeDepartment, departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, wardOptions: wards.wardOptions, wardIndex: wards.wardIndex, procedures, procedureOptions: [...procedures, CUSTOM_PROCEDURE_OPTION], conditionOptions: workspace.settings.conditionTags.filter((item) => !['有引流', '留置导尿'].includes(item)).map((value) => ({ value, selected: (patient.conditions || []).includes(value) })), editConditions: (patient.conditions || []).filter((item) => !['有引流', '留置导尿'].includes(item)),
      departmentIndex: Math.max(0, workspace.settings.departments.indexOf(patient.department)),
      procedureIndex: customProcedureMode ? procedures.length : Math.max(0, knownProcedureIndex),
      customProcedureMode, customProcedure: customProcedureMode ? patient.surgeryName : '', addCustomProcedureToLibrary: false,
      firstAssistants, firstAssistantOptions: ['未填写', ...firstAssistants, CUSTOM_ASSISTANT_OPTION], firstAssistantIndex: assistantIndex >= 0 ? assistantIndex + 1 : (patient.firstAssistant ? firstAssistants.length + 1 : 0), customAssistantMode: Boolean(patient.firstAssistant) && assistantIndex < 0, customAssistant: assistantIndex < 0 ? patient.firstAssistant : '', addCustomAssistantToLibrary: false,
      editForm: draftValidation.value,
    });
  },
  cancelEdit() { this.setData({ editing: false, editForm: {}, editErrors: {}, editIncomplete: false, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false }); },
  inputEdit(e) {
    const field = e.currentTarget.dataset.field;
    const value = ['bed', 'age'].includes(field) ? `${e.detail.value}`.replace(/\D/g, '') : e.detail.value;
    const updates = { [`editForm.${field}`]: value };
    if (field === 'admissionDate' && this.data.editForm.patientType === '日间') {
      updates['editForm.surgeryDate'] = value;
      updates['editForm.plannedDischargeDate'] = value;
    }
    updates[`editErrors.${field}`] = '';
    this.setData(updates);
  },
  chooseEditGender(e) { this.setData({ 'editForm.gender': e.currentTarget.dataset.value, 'editErrors.gender': '' }); },
  chooseEditType(e) {
    const patientType = e.currentTarget.dataset.value;
    const department = patientType === '国疗' ? '' : (this.data.editForm.department || this.data.activeDepartment);
    const prepared = preparePatientDraft({ ...this.data.editForm, patientType, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    const updates = { editForm: prepared.value, departmentIndex: Math.max(0, this.data.departments.indexOf(prepared.value.department)), wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), 'editErrors.patientType': '', 'editErrors.department': '', 'editErrors.ward': '' };
    if (patientType === '日间' && prepared.value.admissionDate) {
      updates['editForm.surgeryDate'] = prepared.value.admissionDate;
      updates['editForm.plannedDischargeDate'] = prepared.value.admissionDate;
    }
    this.setData(updates);
  },
  chooseEditAdmissionState(e) { this.setData({ 'editForm.admissionState': e.currentTarget.dataset.value, 'editErrors.admissionState': '', 'editErrors.bed': '' }); },
  chooseEditAllergyStatus(e) { this.setData({ 'editForm.allergyStatus': e.currentTarget.dataset.value, 'editForm.allergies': e.currentTarget.dataset.value === 'none' ? '' : this.data.editForm.allergies, 'editErrors.allergies': '' }); },
  chooseEditFirstAssistant(e) {
    const firstAssistantIndex = Number(e.detail.value);
    const customAssistantMode = firstAssistantIndex === this.data.firstAssistantOptions.length - 1;
    const firstAssistant = customAssistantMode ? this.data.editForm.firstAssistant : (this.data.firstAssistantOptions[firstAssistantIndex] === '未填写' ? '' : this.data.firstAssistantOptions[firstAssistantIndex]);
    this.setData({ firstAssistantIndex, customAssistantMode, customAssistant: customAssistantMode ? this.data.customAssistant || this.data.editForm.firstAssistant : '', 'editForm.firstAssistant': firstAssistant, addCustomAssistantToLibrary: customAssistantMode ? this.data.addCustomAssistantToLibrary : false });
  },
  inputEditCustomAssistant(e) { this.setData({ customAssistant: e.detail.value, 'editForm.firstAssistant': e.detail.value }); },
  toggleEditCustomAssistantLibrary(e) { this.setData({ addCustomAssistantToLibrary: Boolean(e.detail.value) }); },
  toggleEditCondition(e) {
    const value = e.currentTarget.dataset.value;
    const editConditions = this.data.editConditions.includes(value) ? this.data.editConditions.filter((item) => item !== value) : [...this.data.editConditions, value];
    this.setData({ editConditions, conditionOptions: this.data.conditionOptions.map((item) => ({ ...item, selected: editConditions.includes(item.value) })) });
  },
  chooseEditDepartment(e) {
    const departmentIndex = Number(e.detail.value);
    const department = this.data.departments[departmentIndex] || '';
    const prepared = preparePatientDraft({ ...this.data.editForm, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    this.setData({ departmentIndex, wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), 'editForm.department': department, 'editForm.ward': prepared.value.ward, 'editErrors.department': '', 'editErrors.ward': '' });
  },
  chooseEditWard(e) { const wardIndex = Number(e.detail.value); this.setData({ wardIndex, 'editForm.ward': this.data.wardOptions[wardIndex] || '', 'editErrors.ward': '' }); },
  clearEditDate(e) { const field = e.currentTarget.dataset.field; if (['surgeryDate', 'plannedDischargeDate'].includes(field)) this.setData({ [`editForm.${field}`]: '', [`editErrors.${field}`]: '' }); },
  chooseEditProcedure(e) {
    const procedureIndex = Number(e.detail.value);
    const customProcedureMode = procedureIndex === this.data.procedureOptions.length - 1;
    this.setData({ procedureIndex, customProcedureMode, customProcedure: customProcedureMode ? this.data.customProcedure : '', addCustomProcedureToLibrary: customProcedureMode ? this.data.addCustomProcedureToLibrary : false });
  },
  inputEditCustomProcedure(e) { this.setData({ customProcedure: e.detail.value }); },
  toggleEditCustomProcedureLibrary(e) { this.setData({ addCustomProcedureToLibrary: Boolean(e.detail.value) }); },
  saveEdit() {
    const form = this.data.editForm;
    const workspace = getWorkspace();
    const validation = validatePatientDraft(form, { today: todayKey(), activeDepartment: workspace.settings.activeDepartment, departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, existingPatients: [...workspace.patients, ...workspace.archivedPatients], originalPatientId: this.patientId });
    if (!validation.ok) {
      this.setData({ editForm: validation.value, editErrors: validation.fieldErrors, editIncomplete: true, wardOptions: validation.wardOptions, wardIndex: Math.max(0, validation.wardOptions.indexOf(validation.value.ward)) });
      return wx.showToast({ title: validation.errors[0], icon: 'none', duration: 2500 });
    }
    const selectedProcedure = this.data.procedureOptions[this.data.procedureIndex];
    const procedure = this.data.customProcedureMode ? `${this.data.customProcedure || ''}`.trim() : selectedProcedure;
    if (this.data.customProcedureMode && !procedure) return wx.showToast({ title: '请填写自定义术式名称', icon: 'none' });
    const result = updatePatient(this.patientId, {
      ...validation.value,
      surgeryName: procedure === '未选择术式' ? '' : procedure, conditions: this.data.editConditions,
    });
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none', duration: 2500 });
    if (this.data.customProcedureMode && this.data.addCustomProcedureToLibrary) addSettingItem('procedures', procedure);
    if (this.data.customAssistantMode && this.data.addCustomAssistantToLibrary && `${form.firstAssistant || ''}`.trim()) addSettingItem('firstAssistants', `${form.firstAssistant}`.trim());
    this.patientId = validation.value.id;
    this.setData({ editing: false, editForm: {}, editErrors: {}, editIncomplete: false, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false });
    this.loadPatient();
    wx.showToast({ title: '患者资料已更新', icon: 'success' });
  },
  openDialog(config) { wx.hideKeyboard({ complete: () => this.setData({ dialog: createDialog(config) }) }); },
  closeDialog() {
    if (!this.data.dialog.loading) this.setData({ dialog: emptyDialog() });
  },
  resetDialog() {
    this.dialogBusy = false;
    this.setData({ dialog: emptyDialog() });
  },
  failDialog(message) {
    this.dialogBusy = false;
    this.setData({ 'dialog.loading': false });
    wx.showToast({ title: message || '操作失败', icon: 'none', duration: 2600 });
  },
  confirmDialog() {
    if (this.dialogBusy || this.data.dialog.loading) return;
    const { action, payload } = this.data.dialog;
    this.dialogBusy = true;
    this.setData({ 'dialog.loading': true });
    if (action === 'copy-appointment') {
      const pending = this.pendingAppointment;
      if (!pending) return this.failDialog('预览内容已失效，请重新打开');
      return wx.setClipboardData({
        data: pending.text,
        success: () => {
          const offSchedule = Boolean(pending.timingHint);
          const completed = pending.type === 'discharge-notice' || offSchedule ? false : completeAppointmentTask(this.patientId, pending.type);
          this.resetDialog();
          wx.showToast({ title: offSchedule ? '文本已复制，请核对时机；未标记任务完成' : completed ? `文本已复制，已标记${pending.type === 'photo' ? '拍照' : pending.type === 'radiotherapy' ? '放疗会诊' : 'PPT 已完成'}` : '文本已复制，请手动发送', icon: 'none', duration: 2600 });
          if (completed) this.loadPatient();
        },
        fail: () => this.failDialog('复制失败，请重试'),
      });
    }
    let result;
    if (action === 'mark-discharge-notice') result = addClinicalEvent(this.patientId, 'cooperation-discharge-notice', '已确认通知一助');
    if (action === 'remove-drain') result = removeDrain(this.patientId, payload.deviceId);
    if (action === 'discharge') result = dischargePatient(this.patientId, payload.dischargeDate);
    if (action === 'archive') result = archivePatient(this.patientId);
    if (action === 'revoke-registration') result = revokePatientRegistration(this.patientId);
    if (!result || !result.ok) return this.failDialog((result && result.error) || '操作失败');
    this.resetDialog();
    if (action === 'archive' || action === 'revoke-registration') return wx.navigateBack();
    this.loadPatient();
    wx.showToast({ title: action === 'mark-discharge-notice' ? '出院通知已完成' : action === 'remove-drain' ? '已移除引流列' : '已标记出院', icon: 'success' });
  },
  copyAppointment(e) {
    const patient = getPatient(this.patientId);
    const type = e.currentTarget.dataset.type;
    if (!patient || !['photo', 'radiotherapy', 'surgery-summary', 'discharge-notice'].includes(type)) return;
    const fields = type === 'photo' ? ['name', 'age', 'gender', 'id', 'diagnosis', 'surgeryName', 'surgeon'] : type === 'surgery-summary' ? ['name', 'age', 'gender', 'diagnosis', 'confirmedSurgeryName'] : type === 'discharge-notice' ? ['firstAssistant', 'name', 'id', 'patientType', 'actualDischargeDate'] : ['name', 'gender', 'id', 'diagnosis'];
    const missing = missingFields(patient, fields);
    if (missing.length) return wx.showToast({ title: type === 'photo' ? '请补全患者、术式和主刀信息' : type === 'surgery-summary' ? '请补全姓名、年龄、性别、诊断和术式' : type === 'discharge-notice' ? '请补全一助、姓名、住院号、类别和出院日期' : '请补全患者基本信息和诊断', icon: 'none', duration: 2600 });
    if (type === 'discharge-notice' && !patient.actualDischargeDate && !patient.archived) return wx.showToast({ title: '请先确认患者出院', icon: 'none' });
    if (type === 'surgery-summary' && (!patient.surgeryNameConfirmedAt || !patient.confirmedSurgeryName)) return wx.showToast({ title: '请先完成主刀术式确认', icon: 'none', duration: 2400 });
    const text = appointmentText(patient, type);
    const timingHint = type === 'photo' && getPOD(patient.surgeryDate) !== -1 ? '\n\n提示：当前手术日期不是明日，请核对文本和发送时机。' : type === 'radiotherapy' && !isRadiotherapySchedule(patient) ? '\n\n提示：日间患者应为当日手术；普通或国疗患者应为明日手术，请核对。' : '';
    this.pendingAppointment = { text, timingHint, type };
    this.openDialog({ title: appointmentTitle(type), message: `${text}${timingHint}`, confirmText: '确认复制', action: 'copy-appointment', selectable: true });
  },
  markDischargeNoticeSent() {
    const patient = getPatient(this.patientId);
    if (!patient || !patient.actualDischargeDate) return wx.showToast({ title: '请先确认患者出院', icon: 'none' });
    if (getWorkspace().clinicalEvents.some((item) => item.patientId === this.patientId && item.type === 'cooperation-discharge-notice')) return wx.showToast({ title: '出院通知已完成', icon: 'none' });
    this.openDialog({ title: '确认已完成出院通知？', message: '请确认已将出院通知发送给一助老师；此确认将记录完成时间，并作为归档前置条件。', confirmText: '确认完成', action: 'mark-discharge-notice' });
  },
  inputTask(e) { this.setData({ newTask: e.detail.value }); },
  chooseTaskCategory(e) { this.setData({ taskCategoryIndex: Number(e.detail.value) }); },
  chooseTaskPriority(e) { this.setData({ taskPriorityIndex: Number(e.detail.value) }); },
  addTask() {
    const title = this.data.newTask.trim();
    if (!title) return wx.showToast({ title: '请输入待办内容', icon: 'none' });
    const result = addTask(this.patientId, { title, dueAt: todayKey(), category: this.data.taskCategories[this.data.taskCategoryIndex] || '其他', priority: this.data.taskPriorities[this.data.taskPriorityIndex] || '普通' });
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.setData({ newTask: '' });
    this.loadPatient();
  },
  toggleTask(e) {
    if (this.data.archived) return;
    const task = this.data.patient.tasks.find((item) => item.id === e.currentTarget.dataset.id);
    if (!task) return;
    const done = !task.done;
    const result = setTaskDone(this.patientId, task.id, done);
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none', duration: 2400 });
    wx.showToast({ title: done ? '已完成' : '已恢复待办', icon: 'success' });
    this.loadPatient();
  },
  openSurgeryNameConfirm() {
    if (this.data.archived || !this.data.patient || this.data.patient.careStatus === '已出院') return;
    const patient = getPatient(this.patientId);
    if (!patient) return;
    this.openEditor({ kind: 'surgery-confirm', title: '与主刀确认正式术式', description: '此核查独立留痕，不改变患者事实状态，也不阻断其他操作。', placeholder: '填写确认后的正式手术名称', content: patient.confirmedSurgeryName || patient.surgeryName || '', confirmText: '确认保存' });
  },
  chooseIntraopFirstAssistant(e) {
    if (this.data.archived || this.data.patient.careStatus === '已出院') return;
    const assistant = this.data.intraopAssistantOptions[Number(e.detail.value)];
    if (assistant === CUSTOM_ASSISTANT_OPTION) {
      const patient = getPatient(this.patientId);
      return this.openEditor({ kind: 'first-assistant', title: '填写其他一助医生', placeholder: '一助医生姓名', content: patient && patient.firstAssistant ? patient.firstAssistant : '', confirmText: '保存' });
    }
    const result = updatePatient(this.patientId, { firstAssistant: assistant === '未填写' ? '' : assistant });
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    wx.showToast({ title: assistant === '未填写' ? '已清空一助' : '一助已更新', icon: 'success' });
    this.loadPatient();
  },
  addDrain() {
    if (this.data.archived || this.data.patient.careStatus === '已出院') return;
    this.openEditor({ kind: 'drain', title: '添加引流', placeholder: '例如：盆腔引流、T 管', confirmText: '添加' });
  },
  addDrainRow() {
    if (this.data.archived || this.data.patient.careStatus === '已出院' || !this.data.drainTable.columns.length) return;
    const result = ensureDrainRowCount(this.patientId, this.data.drainTable.rows.length + 1);
    if (!result.ok) return wx.showToast({ title: result.error, icon: 'none' });
    this.loadPatient();
    wx.showToast({ title: `已添加 POD ${result.rowCount} 行`, icon: 'success' });
  },
  editDrainCell(e) {
    if (this.data.archived || this.data.patient.careStatus === '已出院') return;
    const { deviceId, deviceName, pod, value } = e.currentTarget.dataset;
    this.openEditor({ kind: 'drain-cell', title: `${deviceName} · POD ${pod}`, description: '填写引流量（mL）；输入“拔”可记录该引流在本次拔除。', placeholder: '例如：20 或 拔', content: value || '', drainId: deviceId, pod: Number(pod), confirmText: '保存' });
  },
  removeDrainColumn(e) {
    if (this.data.archived || this.data.patient.careStatus === '已出院') return;
    const { deviceId, deviceName } = e.currentTarget.dataset;
    this.openDialog({ title: '移除引流列？', message: `将移除“${deviceName}”。仅无任何记录的误加引流可以移除。`, confirmText: '移除', tone: 'danger', action: 'remove-drain', payload: { deviceId } });
  },
  openEditor(config) {
    this.setData({ editor: { visible: true, title: config.title || '', description: config.description || '', placeholder: config.placeholder || '', content: config.content || '', kind: config.kind || '', drainId: config.drainId || '', pod: config.pod || 0, confirmText: config.confirmText || '保存', warningConfirmed: false, warningText: '', dirty: false, focus: false }, editorKeyboardHeight: 0, editorSaveBusy: false }, () => wx.nextTick(() => this.setData({ 'editor.focus': true })));
  },
  closeEditor() {
    if (!this.data.editorSaveBusy) this.setData({ editor: { visible: false, title: '', description: '', placeholder: '', content: '', kind: '', drainId: '', pod: 0, confirmText: '保存', warningConfirmed: false, warningText: '', dirty: false, focus: false }, editorKeyboardHeight: 0 });
  },
  inputEditor(e) { this.setData({ 'editor.content': e.detail.value, 'editor.warningConfirmed': false, 'editor.warningText': '', 'editor.dirty': true }); },
  editorKeyboardChange(e) {
    const editorKeyboardHeight = Math.max(0, Number(e.detail.height) || 0);
    if (editorKeyboardHeight !== this.data.editorKeyboardHeight) this.setData({ editorKeyboardHeight });
  },
  saveEditor() {
    const editor = this.data.editor;
    const value = `${editor.content || ''}`.trim();
    if (this.data.editorSaveBusy) return;
    let result;
    if (editor.kind === 'surgery-confirm') {
      if (!value) return wx.showToast({ title: '请填写正式手术名称', icon: 'none' });
      this.setData({ editorSaveBusy: true });
      result = confirmSurgeryName(this.patientId, value);
      if (!result.ok) { this.setData({ editorSaveBusy: false }); return wx.showToast({ title: result.error || '保存失败', icon: 'none' }); }
      this.setData({ editor: { visible: false }, editorKeyboardHeight: 0, editorSaveBusy: false });
      wx.showToast({ title: '正式术式已确认', icon: 'success' });
      return this.loadPatient();
    }
    this.setData({ editorSaveBusy: true });
    if (editor.kind === 'first-assistant') result = updatePatient(this.patientId, { firstAssistant: value });
    if (editor.kind === 'drain') result = addDrain(this.patientId, value);
    if (editor.kind === 'drain-cell') result = recordDrainVolume(this.patientId, editor.drainId, value, editor.pod, { confirmWarning: Boolean(editor.warningConfirmed) });
    if (editor.kind === 'discharge-revert') {
      if (!value) return wx.showToast({ title: '请填写撤回出院原因', icon: 'none' });
      result = revertPatientDischarge(this.patientId, value);
    }
    if (result && result.requiresWarningConfirmation) {
      this.setData({ 'editor.warningConfirmed': true, 'editor.warningText': result.warning, editorSaveBusy: false });
      return;
    }
    if (!result || !result.ok) { this.setData({ editorSaveBusy: false }); return wx.showToast({ title: (result && result.error) || '保存失败', icon: 'none' }); }
    this.setData({ editor: { visible: false }, editorKeyboardHeight: 0, editorSaveBusy: false });
    wx.showToast({ title: result.warning || (editor.kind === 'drain' ? '已添加引流列' : editor.kind === 'drain-cell' ? '引流记录已保存' : '已保存'), icon: result.warning ? 'none' : 'success', duration: result.warning ? 3000 : 1500 });
    this.loadPatient();
  },
  goRound() {
    if (this.data.archived) return wx.showToast({ title: '归档患者为只读状态', icon: 'none' });
    wx.navigateTo({ url: `/pages/rounds/rounds?id=${encodeURIComponent(this.patientId)}` });
  },
  chooseDischargeDate(e) {
    if (this.data.patient && this.data.patient.patientType === '日间') return;
    this.setData({ dischargeDateInput: e.detail.value });
  },
  discharge() {
    const patient = this.data.patient || {};
    const dischargeDate = patient.patientType === '日间' ? patient.admissionDate : this.data.dischargeDateInput;
    if (!dischargeDate) return wx.showToast({ title: '请选择出院日期', icon: 'none' });
    this.openDialog({ title: '确认患者出院？', message: `将患者状态设为“出院”，出院日期为 ${dischargeDate}。${patient.patientType === '日间' ? '日间患者出院日期固定为入院日。' : ''}患者资料及待办不会删除。`, confirmText: '确认出院', action: 'discharge', payload: { dischargeDate } });
  },
  revertDischarge() {
    this.openEditor({ kind: 'discharge-revert', title: '撤回出院', description: '将清除实际出院日期并恢复为在院状态；请填写原因。', placeholder: '撤回出院原因（必填）', confirmText: '确认撤回' });
  },
  archive() {
    this.openDialog({ title: '归档这位患者？', message: '归档后将移出主页和在院列表，全部记录保留为只读。', confirmText: '确认归档', action: 'archive' });
  },
  revokeRegistration() {
    this.openDialog({ title: '撤销建档？', message: '仅用于临时取消或误建档。患者及本地关联记录将移入回收站，可在设置中恢复。', confirmText: '确认撤销', tone: 'danger', action: 'revoke-registration' });
  },
});
