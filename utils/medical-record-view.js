const PENDING_STATUSES = ['warning', 'overdue', 'severe', 'today', 'window', 'linked'];

function isPending(cell) {
  return Boolean(cell && !cell.done && PENDING_STATUSES.includes(cell.status));
}

function timelineCell(cell, nodeLabel, extra = {}) {
  const sortDate = cell.dueDate || cell.dischargeDate || '';
  return {
    ...cell,
    ...extra,
    nodeLabel,
    sortDate,
    displayDate: cell.dateLabel || '',
    compactStatusText: cell.statusText || '',
    actionLabel: cell.done ? '撤销' : cell.actionable ? '标记已写' : '未到',
  };
}

export function buildMedicalRecordPatientView(patient) {
  const cellsByKey = new Map();
  (patient.podCells || []).forEach((cell) => {
    if (!cell.requirementKey || cell.status === 'not-applicable') return;
    cellsByKey.set(cell.requirementKey, timelineCell(cell, `POD${cell.pod}`));
  });

  const discharge = patient.dischargeCell;
  if (discharge && discharge.requirementKey && discharge.status !== 'not-applicable') {
    const linked = cellsByKey.get(discharge.requirementKey);
    if (linked) {
      cellsByKey.set(discharge.requirementKey, {
        ...linked,
        nodeLabel: `${linked.nodeLabel} · 出院`,
        linkedDischarge: true,
        windowOpen: discharge.windowOpen,
        dischargeDateLabel: discharge.dateLabel,
        compactStatusText: `${linked.statusText}·出`,
      });
    } else {
      cellsByKey.set(discharge.requirementKey, timelineCell(discharge, '出院病历', { linkedDischarge: false }));
    }
  }

  const allCells = [...cellsByKey.values()];
  const nextCell = allCells.filter((cell) => cell.status === 'future')
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))[0] || null;
  const timeline = allCells.filter((cell) => cell.status !== 'future' || cell === nextCell)
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate) || `${b.nodeLabel}`.localeCompare(`${a.nodeLabel}`));
  const pendingCells = timeline.filter(isPending);

  return {
    ...patient,
    timeline,
    pendingCells,
    pendingCount: pendingCells.length,
    hasPending: pendingCells.length > 0,
    severePendingCount: pendingCells.filter((cell) => cell.status === 'severe').length,
    nextCell,
  };
}

export function filterMedicalRecordRows(rows, viewMode, retainedPatientId = '') {
  if (viewMode === 'pending') return rows.filter((item) => !item.discharged && (item.hasPending || item.id === retainedPatientId));
  if (viewMode === 'discharged') return rows.filter((item) => item.discharged && (item.hasPending || item.id === retainedPatientId));
  return rows.filter((item) => !item.discharged);
}

export function summarizeMedicalRecordRows(rows) {
  const pending = [];
  rows.forEach((patient) => pending.push(...(patient.pendingCells || [])));
  return {
    pending: pending.length,
    severe: pending.filter((item) => item.status === 'severe').length,
    overdue: pending.filter((item) => ['warning', 'overdue', 'severe'].includes(item.status)).length,
    today: pending.filter((item) => item.status === 'today').length,
    dischargeWindow: pending.filter((item) => item.windowOpen || (item.kind === 'discharge' && item.status === 'window')).length,
  };
}
