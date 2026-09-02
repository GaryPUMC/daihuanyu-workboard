// De-identified v3 fixture. Its counts mirror the approved local backup,
// but every identifier, name, date, diagnosis, and note is synthetic.
export function createV3ImportDemo() {
  const patientIds = Array.from({ length: 10 }, (_, index) => `DEMO-V3-${`${index + 1}`.padStart(3, '0')}`);
  const patients = patientIds.map((id, index) => ({
    id,
    name: `测试患者${index + 1}`,
    bed: `${index + 1}`,
    age: `${28 + index}`,
    gender: index % 2 ? '女' : '男',
    department: '整形外科',
    diagnosis: `示例诊断 ${index + 1}`,
    admissionDate: '2026-08-01',
    surgeryDate: index < 5 ? '2026-08-04' : '2026-08-06',
    surgeryName: `示例术式 ${index + 1}`,
    surgeon: '示例主刀',
    firstAssistant: '示例一助',
    patientType: index === 0 ? '日间' : '普通',
    stage: index < 5 ? '术后' : '术前',
    conditions: index % 3 === 0 ? ['抗凝中'] : [],
  }));
  const tasks = Array.from({ length: 58 }, (_, index) => ({
    id: `demo-task-${index + 1}`,
    patientId: patientIds[index % patientIds.length],
    title: `示例待办 ${index + 1}`,
    category: '其他',
    priority: index % 7 === 0 ? '重要' : '普通',
    dueAt: '2026-08-05',
    status: index % 4 === 0 ? 'done' : 'todo',
  }));
  const devices = Array.from({ length: 9 }, (_, index) => ({
    id: `demo-drain-${index + 1}`,
    patientId: patientIds[index % 5],
    type: 'drain',
    name: `示例引流 ${index + 1}`,
    status: 'active',
    placedAt: '2026-08-04T01:00:00.000Z',
  }));
  return {
    schemaVersion: 3,
    settings: { activeDepartment: '整形外科', clinicalPresetVersion: 2 },
    patients,
    archivedPatients: [],
    rounds: [],
    tasks,
    taskDrafts: [],
    templates: [],
    stageLogs: [],
    devices,
    observations: Array.from({ length: 3 }, (_, index) => ({
      id: `demo-observation-${index + 1}`, patientId: patientIds[index], deviceId: devices[index].id,
      type: 'drainVolume', value: 10 + index, unit: 'mL', recordedAt: '2026-08-05T01:00:00.000Z',
    })),
    clinicalEvents: Array.from({ length: 11 }, (_, index) => ({
      id: `demo-event-${index + 1}`, patientId: patientIds[index % patientIds.length], type: 'drain-status',
      value: 'active', note: '示例记录', at: '2026-08-05T01:00:00.000Z',
    })),
    pathologySpecimens: Array.from({ length: 4 }, (_, index) => ({
      id: `demo-specimen-${index + 1}`, patientId: patientIds[index], name: `示例标本 ${index + 1}`,
      status: 'retained', createdAt: '2026-08-04T01:00:00.000Z',
    })),
  };
}
