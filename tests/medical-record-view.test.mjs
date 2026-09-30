import assert from 'node:assert/strict';
import { buildMedicalRecordPatientView, filterMedicalRecordRows, summarizeMedicalRecordRows } from '../utils/medical-record-view.js';

const patient = {
  id: 'VIEW-001', name: '虚拟患者甲', currentPod: 10, discharged: false,
  podCells: [
    { kind: 'pod', pod: 15, dueDate: '2026-09-14', dateLabel: '9/14', requirementKey: 'pod:15', status: 'future', statusText: '未到', done: false, actionable: false },
    { kind: 'pod', pod: 12, dueDate: '2026-09-11', dateLabel: '9/11', requirementKey: 'pod:12', status: 'future', statusText: '未到', done: false, actionable: false },
    { kind: 'pod', pod: 9, dueDate: '2026-09-08', dateLabel: '9/8', requirementKey: 'pod:9', status: 'warning', statusText: '欠1天', done: false, actionable: true },
    { kind: 'pod', pod: 6, dueDate: '2026-09-05', dateLabel: '9/5', requirementKey: 'pod:6', status: 'done', statusText: '✓', done: true, actionable: true },
    { kind: 'pod', pod: 3, dueDate: '2026-09-02', dateLabel: '9/2', requirementKey: 'pod:3', status: 'severe', statusText: '欠7天', done: false, actionable: true },
  ],
  dischargeCell: { kind: 'pod', linkedPod: 9, dueDate: '2026-09-08', dateLabel: '9/8-9/9', requirementKey: 'pod:9', status: 'linked', statusText: '随POD9', done: false, actionable: true, windowOpen: true },
};

const view = buildMedicalRecordPatientView(patient);
assert.equal(view.pendingCount, 2);
assert.equal(view.pendingCells.length, 2);
assert.equal(view.timeline.filter((item) => item.requirementKey === 'pod:9').length, 1, '出院窗口与POD重合时不得重复显示');
assert.equal(view.timeline.find((item) => item.requirementKey === 'pod:9').nodeLabel, 'POD9 · 出院');
assert.equal(view.timeline.find((item) => item.requirementKey === 'pod:9').compactStatusText, '欠1天·出');
assert.deepEqual(view.timeline.map((item) => item.sortDate), ['2026-09-11', '2026-09-08', '2026-09-05', '2026-09-02'], '时间线应由新到旧，且只保留最近一个未来节点');
assert.equal(view.nextCell.requirementKey, 'pod:12');

const crowdedView = buildMedicalRecordPatientView({
  ...patient,
  podCells: [...patient.podCells, { kind: 'pod', pod: 2, dueDate: '2026-09-01', dateLabel: '9/1', requirementKey: 'pod:2', status: 'severe', statusText: '欠8天', done: false, actionable: true }],
});
assert.equal(crowdedView.pendingCount, 3);
assert.equal(crowdedView.pendingCells.length, 3, '主列表必须直接提供全部待处理节点，不得折叠为“还有X项”');

const activeDone = buildMedicalRecordPatientView({ ...patient, id: 'VIEW-002', podCells: patient.podCells.map((item) => ({ ...item, status: item.status === 'future' ? 'future' : 'done', statusText: item.status === 'future' ? '未到' : '✓', done: item.status !== 'future' })), dischargeCell: { kind: 'discharge', requirementKey: '', status: 'not-applicable', done: false, actionable: false } });
const dischargedPending = { ...view, id: 'VIEW-003', discharged: true };
assert.deepEqual(filterMedicalRecordRows([view, activeDone, dischargedPending], 'pending').map((item) => item.id), ['VIEW-001']);
assert.deepEqual(filterMedicalRecordRows([view, activeDone, dischargedPending], 'discharged').map((item) => item.id), ['VIEW-003']);
assert.deepEqual(filterMedicalRecordRows([view, activeDone], 'pending', 'VIEW-002').map((item) => item.id), ['VIEW-001', 'VIEW-002'], '完成最后一项后应短暂保留该患者以便撤销');

assert.deepEqual(summarizeMedicalRecordRows([view]), { pending: 2, severe: 1, overdue: 2, today: 0, dischargeWindow: 1 });

console.log('compact medical-record patient view, deduplication, next date, and filters: passed');
