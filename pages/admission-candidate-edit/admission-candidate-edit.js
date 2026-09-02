import { addSettingItem, todayKey } from '../../utils/workspace-store';
import { preparePatientDraft, validatePatientDraft } from '../../utils/patient-draft';

const CUSTOM_ASSISTANT_OPTION = '其他（手动填写）';
const ALLERGY_OPTIONS = [
  { value: 'unknown', label: '未核实' }, { value: 'none', label: '无' }, { value: 'present', label: '有' },
];

Page({
  data: {
    ready: false, candidateId: '', form: {}, formErrors: {}, incomplete: false,
    activeDepartment: '', departments: [], departmentWards: {}, departmentIndex: 0, wardOptions: [], wardIndex: 0,
    genders: ['男', '女'], patientTypes: ['普通', '国疗', '日间'], allergyOptions: ALLERGY_OPTIONS,
    firstAssistantOptions: [], firstAssistantIndex: 0, customAssistantMode: false, customAssistant: '', addCustomAssistantToLibrary: false,
    existingPatients: [],
  },
  onLoad() {
    this.channel = this.getOpenerEventChannel();
    this.channel.on('initCandidateEditor', (payload) => this.initialize(payload));
  },
  initialize(payload = {}) {
    const firstAssistants = payload.firstAssistants || [];
    const patient = payload.patient || {};
    const prepared = preparePatientDraft(patient, { activeDepartment: payload.activeDepartment, departmentWards: payload.departmentWards });
    const assistantIndex = firstAssistants.indexOf(prepared.value.firstAssistant);
    this.setData({
      ready: true, candidateId: payload.candidateId || '', form: prepared.value,
      formErrors: payload.fieldErrors || {}, incomplete: Object.keys(payload.fieldErrors || {}).length > 0, activeDepartment: payload.activeDepartment || '',
      departments: payload.departments || [], departmentWards: payload.departmentWards || {}, existingPatients: payload.existingPatients || [],
      departmentIndex: Math.max(0, (payload.departments || []).indexOf(prepared.value.department)),
      wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)),
      firstAssistantOptions: ['未填写', ...firstAssistants, CUSTOM_ASSISTANT_OPTION],
      firstAssistantIndex: assistantIndex >= 0 ? assistantIndex + 1 : (prepared.value.firstAssistant ? firstAssistants.length + 1 : 0),
      customAssistantMode: Boolean(prepared.value.firstAssistant) && assistantIndex < 0,
      customAssistant: assistantIndex < 0 ? prepared.value.firstAssistant : '',
    });
  },
  input(e) {
    const field = e.currentTarget.dataset.field;
    const value = ['bed', 'age'].includes(field) ? `${e.detail.value}`.replace(/\D/g, '') : e.detail.value;
    const updates = { [`form.${field}`]: value, [`formErrors.${field}`]: '' };
    if (field === 'admissionDate' && this.data.form.patientType === '日间') {
      updates['form.surgeryDate'] = value;
      updates['form.plannedDischargeDate'] = value;
      updates['formErrors.surgeryDate'] = '';
      updates['formErrors.plannedDischargeDate'] = '';
    }
    this.setData(updates);
  },
  chooseGender(e) { this.setData({ 'form.gender': e.currentTarget.dataset.value, 'formErrors.gender': '' }); },
  chooseAdmissionState(e) { this.setData({ 'form.admissionState': e.currentTarget.dataset.value, 'formErrors.admissionState': '', 'formErrors.bed': '' }); },
  choosePatientType(e) {
    const patientType = e.currentTarget.dataset.value;
    const department = patientType === '国疗' ? '' : (this.data.form.department || this.data.activeDepartment);
    const prepared = preparePatientDraft({ ...this.data.form, patientType, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    const updates = {
      form: prepared.value, departmentIndex: Math.max(0, this.data.departments.indexOf(prepared.value.department)),
      wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)),
      'formErrors.patientType': '', 'formErrors.department': '', 'formErrors.ward': '',
    };
    if (patientType === '日间' && prepared.value.admissionDate) {
      updates['form.surgeryDate'] = prepared.value.admissionDate;
      updates['form.plannedDischargeDate'] = prepared.value.admissionDate;
    }
    this.setData(updates);
  },
  chooseDepartment(e) {
    const departmentIndex = Number(e.detail.value);
    const department = this.data.departments[departmentIndex] || '';
    const prepared = preparePatientDraft({ ...this.data.form, department, ward: '' }, { activeDepartment: this.data.activeDepartment, departmentWards: this.data.departmentWards });
    this.setData({ departmentIndex, form: prepared.value, wardOptions: prepared.wards, wardIndex: Math.max(0, prepared.wards.indexOf(prepared.value.ward)), 'formErrors.department': '', 'formErrors.ward': '' });
  },
  chooseWard(e) { const wardIndex = Number(e.detail.value); this.setData({ wardIndex, 'form.ward': this.data.wardOptions[wardIndex] || '', 'formErrors.ward': '' }); },
  chooseAllergyStatus(e) {
    const status = e.currentTarget.dataset.value;
    this.setData({ 'form.allergyStatus': status, 'form.allergies': status === 'none' ? '' : this.data.form.allergies, 'formErrors.allergies': '' });
  },
  chooseFirstAssistant(e) {
    const firstAssistantIndex = Number(e.detail.value);
    const customAssistantMode = firstAssistantIndex === this.data.firstAssistantOptions.length - 1;
    const selected = this.data.firstAssistantOptions[firstAssistantIndex];
    const firstAssistant = customAssistantMode ? this.data.form.firstAssistant : (selected === '未填写' ? '' : selected);
    this.setData({ firstAssistantIndex, customAssistantMode, customAssistant: customAssistantMode ? this.data.customAssistant || this.data.form.firstAssistant : '', 'form.firstAssistant': firstAssistant, addCustomAssistantToLibrary: customAssistantMode ? this.data.addCustomAssistantToLibrary : false });
  },
  inputCustomAssistant(e) { this.setData({ customAssistant: e.detail.value, 'form.firstAssistant': e.detail.value }); },
  toggleCustomAssistantLibrary(e) { this.setData({ addCustomAssistantToLibrary: Boolean(e.detail.value) }); },
  changeManaged(e) { this.setData({ 'form.managedByDaihuanyu': Boolean(e.detail.value), 'formErrors.managedByDaihuanyu': '' }); },
  clearDate(e) {
    const field = e.currentTarget.dataset.field;
    if (!['surgeryDate', 'plannedDischargeDate'].includes(field)) return;
    this.setData({ [`form.${field}`]: '', [`formErrors.${field}`]: '' });
  },
  save() {
    const validation = validatePatientDraft(this.data.form, {
      today: todayKey(), activeDepartment: this.data.activeDepartment, departments: this.data.departments,
      departmentWards: this.data.departmentWards, existingPatients: this.data.existingPatients,
    });
    if (this.data.form.managedByDaihuanyu !== true) {
      validation.ok = false;
      validation.fieldErrors.managedByDaihuanyu = '仅可导入明确由代寰宇负责管理的患者';
      validation.errors.unshift(validation.fieldErrors.managedByDaihuanyu);
    }
    if (!validation.ok) {
      this.setData({ form: validation.value, formErrors: validation.fieldErrors, incomplete: true, wardOptions: validation.wardOptions, wardIndex: Math.max(0, validation.wardOptions.indexOf(validation.value.ward)) });
      return wx.showToast({ title: validation.errors[0], icon: 'none', duration: 2500 });
    }
    if (this.data.customAssistantMode && this.data.addCustomAssistantToLibrary && validation.value.firstAssistant) addSettingItem('firstAssistants', validation.value.firstAssistant);
    this.channel.emit('candidateUpdated', { candidateId: this.data.candidateId, patient: validation.value });
    wx.navigateBack();
  },
});
