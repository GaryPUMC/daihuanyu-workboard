import { addSettingItem, createPatient, getDepartmentWards, getPatientStatus, getPrivacyMaskEnabled, getWorkspace, maskPatient, setActiveDepartment, setPrivacyMaskEnabled, todayKey, updatePatient } from '../../utils/workspace-store';
import { preparePatientDraft, validatePatientDraft } from '../../utils/patient-draft';

const CUSTOM_PROCEDURE_OPTION = '＋ 自定义新术式';
const CUSTOM_ASSISTANT_OPTION = '其他（手动填写）';
const ALLERGY_OPTIONS = [
  { value: 'unknown', label: '未核实' }, { value: 'none', label: '无' }, { value: 'present', label: '有' },
];

function isDischargedPatient(patient) {
  return getPatientStatus(patient) === '已出院';
}

function nextDayKey(dateString) {
  const [year, month, day] = `${dateString}`.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
}

function wardFormState(department, departmentWards, ward = '') {
  const wardOptions = getDepartmentWards(department, { departmentWards });
  const selectedWard = wardOptions.length === 1 ? wardOptions[0] : (wardOptions.includes(ward) ? ward : '');
  return { wardOptions, ward: selectedWard, wardIndex: Math.max(0, wardOptions.indexOf(selectedWard)) };
}

function comparePatients(a, b) {
  const wardDiff = `${a.ward || ''}`.localeCompare(`${b.ward || ''}`);
  if (wardDiff) return wardDiff;
  const bedDiff = Number(a.bed || 999999) - Number(b.bed || 999999);
  return bedDiff || `${a.name || ''}`.localeCompare(`${b.name || ''}`);
}

const emptyForm = () => {
  const admissionDate = todayKey();
  return { id: '', name: '', ward: '', bed: '', age: '', gender: '', diagnosis: '', allergyStatus: 'unknown', allergies: '', admissionState: '', admissionDate, surgeryDate: nextDayKey(admissionDate), plannedDischargeDate: '', surgeon: '', firstAssistant: '', patientType: '', department: '' };
};

Page({
  data: {
    patients: [], query: '', viewMode: 'active', privacyVisible: true,
    showForm: false, editingId: '', form: emptyForm(), formErrors: {}, formIncomplete: false,
    departments: [], departmentWards: {}, departmentIndex: 0, wardOptions: [], wardIndex: 0, procedures: [], procedureOptions: [], procedureIndex: 0, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false,
    diagnoses: [], genders: ['男', '女'], patientTypes: ['普通', '国疗', '日间'], allergyOptions: ALLERGY_OPTIONS, activeDepartment: '', currentDepartmentIndex: 0,
    firstAssistants: [], firstAssistantOptions: [], firstAssistantIndex: 0, customAssistantMode: false, customAssistant: '', addCustomAssistantToLibrary: false,
  },
  onShow() {
    this.setData({ privacyVisible: !getPrivacyMaskEnabled() });
    this.loadPatients();
  },
  loadPatients() {
    const query = this.data.query.trim().toLowerCase();
    const workspace = getWorkspace();
    const activeDepartment = workspace.settings.activeDepartment;
    const activePatients = workspace.patients.filter((patient) => !isDischargedPatient(patient));
    const dischargedPatients = workspace.patients.filter(isDischargedPatient);
    const allPatients = this.data.viewMode === 'archive' ? [...dischargedPatients, ...workspace.archivedPatients] : activePatients;
    const scopedPatients = allPatients.filter((patient) => patient.department === activeDepartment);
    const source = scopedPatients;
    let patients = source.map((patient) => {
      const masked = maskPatient(patient, workspace.settings.departmentWards);
      return {
        ...masked,
        displayName: this.data.privacyVisible ? patient.name : masked.displayName,
        displayId: this.data.privacyVisible ? patient.id : masked.displayId,
        listBadge: this.data.viewMode === 'archive' ? '出' : masked.careStatus === '待入院' ? '待' : patient.admissionDate === todayKey() ? '新' : '',
      };
    });
    if (query) patients = patients.filter((item) => `${item.id}${item.name}${item.ward}${item.bed}${item.locationLabel}${item.department}${item.diagnosis}`.toLowerCase().includes(query));
    patients.sort(comparePatients);
    this.setData({
      patients,
      departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, procedures: workspace.settings.procedures, procedureOptions: [...workspace.settings.procedures, CUSTOM_PROCEDURE_OPTION],
      diagnoses: workspace.settings.diagnoses, activeDepartment, currentDepartmentIndex: Math.max(0, workspace.settings.departments.indexOf(activeDepartment)),
    });
  },
  search(e) { this.setData({ query: e.detail.value }, () => this.loadPatients()); },
  switchView(e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode, showForm: false, editingId: '' }, () => this.loadPatients());
  },
  togglePrivacy() { const privacyVisible = !this.data.privacyVisible; setPrivacyMaskEnabled(!privacyVisible); this.setData({ privacyVisible }, () => this.loadPatients()); },
  startCreate() {
    const workspace = getWorkspace();
    const department = workspace.settings.activeDepartment;
    const prepared = preparePatientDraft({ ...emptyForm(), department }, { activeDepartment: department, departmentWards: workspace.settings.departmentWards });
    this.setData({ showForm: true, editingId: '', form: prepared.value, formErrors: {}, formIncomplete: false, departmentIndex: Math.max(0, workspace.settings.departments.indexOf(department)), wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), procedureIndex: 0, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false, firstAssistants: workspace.settings.firstAssistants, firstAssistantOptions: ['未填写', ...workspace.settings.firstAssistants, CUSTOM_ASSISTANT_OPTION], firstAssistantIndex: 0, customAssistantMode: false, customAssistant: '', addCustomAssistantToLibrary: false });
  },
  cancelForm() { this.setData({ showForm: false, editingId: '', form: emptyForm(), formErrors: {}, formIncomplete: false }); },
  goAdmissionImport() { wx.navigateTo({ url: '/pages/admission-import/admission-import' }); },
  editPatient(e) {
    const id = e.currentTarget.dataset.id;
    const workspace = getWorkspace();
    const patient = workspace.patients.find((item) => item.id === id);
    if (!patient) return;
    const procedure = patient.surgeryName || '未选择术式';
    const knownProcedureIndex = workspace.settings.procedures.indexOf(procedure);
    const customProcedureMode = Boolean(patient.surgeryName) && knownProcedureIndex < 0;
    const firstAssistants = workspace.settings.firstAssistants;
    const assistantIndex = firstAssistants.indexOf(patient.firstAssistant);
    const draftValidation = validatePatientDraft(patient, { today: todayKey(), activeDepartment: workspace.settings.activeDepartment, departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards, existingPatients: [...workspace.patients, ...workspace.archivedPatients], originalPatientId: id });
    const wards = { wardOptions: draftValidation.wardOptions, ward: draftValidation.value.ward, wardIndex: Math.max(0, draftValidation.wardOptions.indexOf(draftValidation.value.ward)) };
    this.setData({
      showForm: true, editingId: id,
      form: draftValidation.value,
      formErrors: draftValidation.fieldErrors, formIncomplete: !draftValidation.ok || Boolean(patient.admissionStateNeedsReview),
      departmentIndex: Math.max(0, workspace.settings.departments.indexOf(patient.department)), wardOptions: wards.wardOptions, wardIndex: wards.wardIndex,
      procedureIndex: customProcedureMode ? workspace.settings.procedures.length : Math.max(0, knownProcedureIndex),
      customProcedureMode, customProcedure: customProcedureMode ? patient.surgeryName : '', addCustomProcedureToLibrary: false,
      firstAssistants, firstAssistantOptions: ['未填写', ...firstAssistants, CUSTOM_ASSISTANT_OPTION], firstAssistantIndex: assistantIndex >= 0 ? assistantIndex + 1 : (patient.firstAssistant ? firstAssistants.length + 1 : 0), customAssistantMode: Boolean(patient.firstAssistant) && assistantIndex < 0, customAssistant: assistantIndex < 0 ? patient.firstAssistant : '', addCustomAssistantToLibrary: false,
    });
  },
  input(e) {
    const field = e.currentTarget.dataset.field;
    const value = ['bed', 'age'].includes(field) ? `${e.detail.value}`.replace(/\D/g, '') : e.detail.value;
    const updates = { [`form.${field}`]: value };
    if (field === 'admissionDate' && this.data.form.patientType === '日间') {
      updates['form.surgeryDate'] = value;
      updates['form.plannedDischargeDate'] = value;
    }
    updates[`formErrors.${field}`] = '';
    this.setData(updates);
  },
  chooseDepartment(e) {
    const departmentIndex = Number(e.detail.value);
    const department = this.data.departments[departmentIndex] || '';
    const prepared = preparePatientDraft({ ...this.data.form, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    this.setData({ departmentIndex, wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), 'form.department': department, 'form.ward': prepared.value.ward, 'formErrors.department': '', 'formErrors.ward': '' });
  },
  chooseWard(e) { const wardIndex = Number(e.detail.value); this.setData({ wardIndex, 'form.ward': this.data.wardOptions[wardIndex] || '', 'formErrors.ward': '' }); },
  chooseGender(e) { this.setData({ 'form.gender': e.currentTarget.dataset.value, 'formErrors.gender': '' }); },
  choosePatientType(e) {
    const patientType = e.currentTarget.dataset.value;
    const department = patientType === '国疗' ? '' : (this.data.form.department || this.data.activeDepartment);
    const prepared = preparePatientDraft({ ...this.data.form, patientType, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    const departmentIndex = Math.max(0, this.data.departments.indexOf(prepared.value.department));
    const updates = { 'form.patientType': patientType, 'form.department': prepared.value.department, 'form.ward': prepared.value.ward, departmentIndex, wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), 'formErrors.patientType': '', 'formErrors.department': '', 'formErrors.ward': '' };
    if (patientType === '日间' && this.data.form.admissionDate) {
      updates['form.surgeryDate'] = this.data.form.admissionDate;
      updates['form.plannedDischargeDate'] = this.data.form.admissionDate;
    }
    this.setData(updates);
  },
  chooseAdmissionState(e) { this.setData({ 'form.admissionState': e.currentTarget.dataset.value, 'formErrors.admissionState': '', 'formErrors.bed': '' }); },
  clearFormDate(e) {
    const field = e.currentTarget.dataset.field;
    if (!['surgeryDate', 'plannedDischargeDate'].includes(field)) return;
    this.setData({ [`form.${field}`]: '', [`formErrors.${field}`]: '' });
  },
  chooseAllergyStatus(e) { this.setData({ 'form.allergyStatus': e.currentTarget.dataset.value, 'form.allergies': e.currentTarget.dataset.value === 'none' ? '' : this.data.form.allergies }); },
  chooseFirstAssistant(e) {
    const firstAssistantIndex = Number(e.detail.value);
    const customAssistantMode = firstAssistantIndex === this.data.firstAssistantOptions.length - 1;
    const firstAssistant = customAssistantMode ? this.data.form.firstAssistant : (this.data.firstAssistantOptions[firstAssistantIndex] === '未填写' ? '' : this.data.firstAssistantOptions[firstAssistantIndex]);
    this.setData({ firstAssistantIndex, customAssistantMode, customAssistant: customAssistantMode ? this.data.customAssistant || this.data.form.firstAssistant : '', 'form.firstAssistant': firstAssistant, addCustomAssistantToLibrary: customAssistantMode ? this.data.addCustomAssistantToLibrary : false });
  },
  inputCustomAssistant(e) { this.setData({ customAssistant: e.detail.value, 'form.firstAssistant': e.detail.value }); },
  toggleAddCustomAssistant(e) { this.setData({ addCustomAssistantToLibrary: Boolean(e.detail.value) }); },
  chooseCurrentDepartment(e) {
    const department = this.data.departments[Number(e.detail.value)];
    if (department && setActiveDepartment(department)) this.setData({ showForm: false, editingId: '' }, () => this.loadPatients());
  },
  chooseProcedure(e) {
    const procedureIndex = Number(e.detail.value);
    const customProcedureMode = procedureIndex === this.data.procedureOptions.length - 1;
    this.setData({ procedureIndex, customProcedureMode, customProcedure: customProcedureMode ? this.data.customProcedure : '', addCustomProcedureToLibrary: customProcedureMode ? this.data.addCustomProcedureToLibrary : false });
  },
  inputCustomProcedure(e) { this.setData({ customProcedure: e.detail.value }); },
  toggleAddCustomProcedure(e) { this.setData({ addCustomProcedureToLibrary: Boolean(e.detail.value) }); },
  chooseDiagnosis(e) { this.setData({ 'form.diagnosis': e.currentTarget.dataset.value }); },
  savePatient() {
    const workspace = getWorkspace();
    const validation = validatePatientDraft(this.data.form, {
      today: todayKey(), activeDepartment: workspace.settings.activeDepartment,
      departments: workspace.settings.departments, departmentWards: workspace.settings.departmentWards,
      existingPatients: [...workspace.patients, ...workspace.archivedPatients], originalPatientId: this.data.editingId,
    });
    if (!validation.ok) {
      this.setData({ form: validation.value, formErrors: validation.fieldErrors, formIncomplete: true, wardOptions: validation.wardOptions, wardIndex: Math.max(0, validation.wardOptions.indexOf(validation.value.ward)) });
      return wx.showToast({ title: validation.errors[0], icon: 'none', duration: 2500 });
    }
    const { id, name, ward, bed, age, gender, diagnosis, allergyStatus, allergies, admissionState, admissionDate, surgeryDate, plannedDischargeDate, surgeon, firstAssistant, patientType } = validation.value;
    const selectedProcedure = this.data.procedureOptions[this.data.procedureIndex];
    const procedure = this.data.customProcedureMode ? `${this.data.customProcedure || ''}`.trim() : selectedProcedure;
    if (this.data.customProcedureMode && !procedure) return wx.showToast({ title: '请填写自定义术式名称', icon: 'none' });
    const payload = {
      id: id.trim(), name: name.trim(), ward: ward.trim(), bed: bed.trim(), age: age.trim(), gender,
      diagnosis: diagnosis.trim(), allergyStatus, allergies: allergies.trim(), admissionState, admissionDate, surgeryDate, plannedDischargeDate, surgeon: surgeon.trim(), firstAssistant: firstAssistant.trim(), patientType,
      surgeryName: procedure === '未选择术式' ? '' : procedure,
      department: validation.value.department,
    };
    let result;
    const wasEditing = Boolean(this.data.editingId);
    if (wasEditing) result = updatePatient(this.data.editingId, payload);
    else {
      result = createPatient(payload);
    }
    if (!result.ok) { if (result.fieldErrors) this.setData({ formErrors: result.fieldErrors, formIncomplete: true }); return wx.showToast({ title: result.error, icon: 'none', duration: 2500 }); }
    if (this.data.customProcedureMode && this.data.addCustomProcedureToLibrary) addSettingItem('procedures', procedure);
    if (this.data.customAssistantMode && this.data.addCustomAssistantToLibrary && firstAssistant.trim()) addSettingItem('firstAssistants', firstAssistant.trim());
    this.setData({ showForm: false, editingId: '', form: emptyForm(), formErrors: {}, formIncomplete: false, procedureIndex: 0, customProcedureMode: false, customProcedure: '', addCustomProcedureToLibrary: false });
    this.loadPatients();
    wx.showToast({ title: wasEditing ? '患者资料已更新' : '已保存至本机', icon: 'success' });
  },
  goDetail(e) { wx.navigateTo({ url: `/pages/patient-detail/patient-detail?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
});
