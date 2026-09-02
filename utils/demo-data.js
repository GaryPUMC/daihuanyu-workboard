function dayKey(referenceDate, offset) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}-${`${date.getUTCDate()}`.padStart(2, '0')}`;
}

// De-identified v3-shaped demo. It mirrors only the approved backup's record
// counts and relationships; all displayed values are synthetic.
export function createDeidentifiedV3Demo(today) {
  const patientIds = Array.from({ length: 10 }, (_, index) => `DEMO-V3-${`${index + 1}`.padStart(3, '0')}`);
  const patientDates = [
    { admissionDate: today, surgeryDate: today, actualDischargeDate: today, patientType: '日间', stage: '术后' },
    { admissionDate: today, surgeryDate: dayKey(today, 1), stage: '术前' },
    { admissionDate: dayKey(today, -1), surgeryDate: today, stage: '术前' },
    { admissionDate: dayKey(today, -3), surgeryDate: dayKey(today, -1), stage: '术后' },
    { admissionDate: dayKey(today, -4), surgeryDate: dayKey(today, -2), actualDischargeDate: today, stage: '出院' },
  ];
  const patients = patientIds.map((id, index) => {
    const dates = patientDates[index % patientDates.length];
    return {
      id, name: `测试患者${index + 1}`, bed: `${index + 1}`, age: `${28 + index}`,
      gender: index % 2 ? '女' : '男', department: '整形外科', diagnosis: `示例诊断 ${index + 1}`,
      surgeryName: `示例术式 ${index + 1}`, surgeon: '示例主刀', firstAssistant: '示例一助',
      conditions: index % 3 === 0 ? ['抗凝中'] : [], ...dates,
    };
  });
  const tasks = Array.from({ length: 58 }, (_, index) => ({
    id: `demo-task-${index + 1}`, patientId: patientIds[index % patientIds.length], title: `示例待办 ${index + 1}`,
    category: '其他', priority: index % 7 === 0 ? '重要' : '普通', dueAt: today, status: index % 4 === 0 ? 'done' : 'todo',
  }));
  const devices = Array.from({ length: 9 }, (_, index) => ({
    id: `demo-drain-${index + 1}`, patientId: patientIds[index % 5], type: 'drain', name: `示例引流 ${index + 1}`,
    status: 'active', placedAt: `${today}T01:00:00.000Z`,
  }));
  return {
    schemaVersion: 3,
    settings: { activeDepartment: '整形外科', clinicalPresetVersion: 2 },
    patients, archivedPatients: [], rounds: [], tasks, taskDrafts: [], templates: [], stageLogs: [], devices,
    observations: Array.from({ length: 3 }, (_, index) => ({
      id: `demo-observation-${index + 1}`, patientId: patientIds[index], deviceId: devices[index].id,
      type: 'drainVolume', value: 10 + index, unit: 'mL', recordedAt: `${today}T01:00:00.000Z`,
    })),
    clinicalEvents: Array.from({ length: 11 }, (_, index) => ({
      id: `demo-event-${index + 1}`, patientId: patientIds[index % patientIds.length], type: 'drain-status',
      value: 'active', note: '示例记录', at: `${today}T01:00:00.000Z`,
    })),
    pathologySpecimens: Array.from({ length: 4 }, (_, index) => ({
      id: `demo-specimen-${index + 1}`, patientId: patientIds[index], name: `示例标本 ${index + 1}`,
      status: 'retained', createdAt: `${today}T01:00:00.000Z`,
    })),
  };
}
