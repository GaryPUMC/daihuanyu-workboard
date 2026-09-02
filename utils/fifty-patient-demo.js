// 开发测试专用：50 位完全脱敏虚拟患者。所有日期均按北京时间当天动态生成，
// 不包含任何真实患者资料，且可安全用于微信开发者工具的界面联调。

function dayKey(referenceDate, offset) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
}

const TYPE_SEQUENCE = ['普通', '国疗', '普通', '日间', '普通', '国疗', '普通', '国疗', '日间', '普通'];
const DEPARTMENTS = ['整形外科', '普外科', '骨科', '泌尿外科', '妇产科', '神经外科', '轮转通用'];
const ACTIVE_STAGES = ['入院', '检查', '谈话', '术前', '手术', '术后'];
const FOCUS_SEQUENCE = ['建档与过敏史', '查房记录', '阶段关键项', '术中一助', '引流记录', '任务幂等', '资料更正', '流程退回', '出院待归档', '备份恢复'];
// 覆盖双字、三字、少数民族间隔符、英文连字符、超长姓名等显示/检索场景；均为虚构脱敏数据。
const NAME_VARIANTS = ['王芳', '李小龙', '欧阳娜娜', '阿布都热西提·艾买提', 'Anne-Marie Thompson', '张三丰长名测试患者', '陈', '司徒静'];

export const FIFTY_PATIENT_SCENARIOS = Array.from({ length: 50 }, (_, index) => {
  const number = index + 1;
  const status = number <= 38 ? '在院' : number <= 44 ? '出院待归档' : '已归档';
  return {
    id: `QA-BENCH-${`${number}`.padStart(3, '0')}`,
    name: NAME_VARIANTS[index % NAME_VARIANTS.length],
    patientType: TYPE_SEQUENCE[index % TYPE_SEQUENCE.length],
    department: DEPARTMENTS[index % DEPARTMENTS.length],
    status,
    focus: status === '在院' ? FOCUS_SEQUENCE[index % FOCUS_SEQUENCE.length] : status === '出院待归档' ? '实际出院、通知一助与归档前关键项' : '归档只读与历史记录保留',
  };
});

export function createFiftyPatientDemo(today) {
  const patients = [];
  const archivedPatients = [];
  const tasks = [];
  const rounds = [];
  const devices = [];
  const observations = [];
  const clinicalEvents = [];
  const stageLogs = [];
  const pathologySpecimens = [];

  FIFTY_PATIENT_SCENARIOS.forEach((scenario, index) => {
    const number = index + 1;
    const isDay = scenario.patientType === '日间';
    const isDischarged = scenario.status !== '在院';
    const archived = scenario.status === '已归档';
    const admissionDate = isDay ? today : dayKey(today, -(2 + (index % 6)));
    const surgeryDate = isDay ? today : dayKey(admissionDate, 1 + (index % 2));
    const plannedDischargeDate = isDay ? today : dayKey(surgeryDate, 1 + (index % 3));
    const actualDischargeDate = isDischarged ? (isDay ? today : dayKey(today, -(index % 3))) : '';
    const stage = isDischarged ? (archived ? '整理' : '出院') : ACTIVE_STAGES[index % ACTIVE_STAGES.length];
    const patient = {
      id: scenario.id, name: scenario.name, bed: `${100 + number}`, age: `${24 + (index % 55)}`,
      gender: index % 2 ? '女' : '男', department: scenario.department, patientType: scenario.patientType, diagnosis: `脱敏基准诊断-${(index % 9) + 1}`,
      admissionDate, surgeryDate, plannedDischargeDate, actualDischargeDate, surgeryName: `脱敏基准术式-${(index % 7) + 1}`,
      confirmedSurgeryName: index % 4 === 0 ? `脱敏正式术式-${(index % 7) + 1}` : '', surgeryNameConfirmedAt: index % 4 === 0 ? `${today}T01:00:00.000Z` : '',
      surgeon: `虚拟主刀${(index % 4) + 1}`, firstAssistant: index % 5 === 0 ? '' : `虚拟一助${(index % 5) + 1}`,
      stage, allergyStatus: index % 5 === 0 ? 'present' : index % 3 === 0 ? 'unknown' : 'none', allergies: index % 5 === 0 ? '脱敏药物反应史' : '',
      conditions: index % 6 === 0 ? ['抗凝中'] : [], archived, archivedAt: archived ? `${today}T02:00:00.000Z` : '',
    };
    (archived ? archivedPatients : patients).push(patient);
    tasks.push({ id: `bench-task-${number}-routine`, patientId: scenario.id, title: `基准待办-${number}`, category: '查房', priority: index % 7 === 0 ? '重要' : '普通', dueAt: today, status: index % 4 === 0 ? 'done' : 'todo', source: '基准集' });
    if (isDischarged) tasks.push({ id: `bench-task-${number}-discharge`, patientId: scenario.id, title: '完成出院记录、宣教与复诊安排', category: '出院整理', priority: '重要', dueAt: actualDischargeDate, status: archived || index % 2 === 0 ? 'done' : 'todo', stage: '出院', critical: true, source: '阶段要求', sourceRef: `stage:出院:${number}` });
    if (index % 2 === 0) rounds.push({ id: `bench-round-${number}`, patientId: scenario.id, date: today, content: `脱敏文字查房记录-${number}\n继续观察并按实际情况处理。`, createdAt: `${today}T03:00:00.000Z`, updatedAt: `${today}T03:00:00.000Z` });
    if (['手术', '术后', '出院', '整理'].includes(stage) && index % 3 === 0) {
      const deviceId = `bench-drain-${number}`;
      devices.push({ id: deviceId, patientId: scenario.id, type: 'drain', name: `脱敏引流-${number}`, status: index % 9 === 0 ? 'removed' : 'active', placedAt: `${surgeryDate}T04:00:00.000Z` });
      observations.push({ id: `bench-observation-${number}`, patientId: scenario.id, deviceId, type: 'drainVolume', entryType: index % 9 === 0 ? 'removed' : 'volume', pod: 1, value: index % 9 === 0 ? null : 10 + index, unit: 'mL', recordedAt: `${today}T05:00:00.000Z` });
    }
    if (isDischarged && (archived || index % 2 === 0)) clinicalEvents.push({ id: `bench-event-${number}`, patientId: scenario.id, type: 'cooperation-discharge-notice', value: '已通知虚拟一助', note: '完全脱敏基准记录', at: `${today}T06:00:00.000Z` });
    if (index % 5 === 0) pathologySpecimens.push({ id: `bench-specimen-${number}`, patientId: scenario.id, name: `脱敏标本-${number}`, status: 'retained', createdAt: `${surgeryDate}T07:00:00.000Z`, updatedAt: `${surgeryDate}T07:00:00.000Z` });
    stageLogs.push({ id: `bench-stage-${number}`, patientId: scenario.id, fromStage: '', toStage: stage, action: 'benchmark-seed', note: scenario.focus, at: `${today}T08:00:00.000Z` });
  });

  return {
    schemaVersion: 8, settings: { activeDepartment: '整形外科', clinicalPresetVersion: 4 }, patients, archivedPatients, tasks, rounds, devices, observations, clinicalEvents, pathologySpecimens, stageLogs,
    taskDrafts: [], templates: [], revokedRegistrations: [], meta: { createdAt: `${today}T00:00:00.000Z`, updatedAt: `${today}T00:00:00.000Z` },
  };
}
