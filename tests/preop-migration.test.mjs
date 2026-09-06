import assert from 'node:assert/strict';
import fs from 'node:fs';

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};

const draftSource = fs.readFileSync(new URL('../utils/patient-draft.js', import.meta.url), 'utf8');
const draftUrl = `data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`;
const source = fs.readFileSync(new URL('../utils/workspace-store.js', import.meta.url), 'utf8').replace("'./patient-draft'", `'${draftUrl}'`);
const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const basePatient = {
  bed: '1', age: '40', gender: '男', department: '整形外科', patientType: '普通',
  diagnosis: '脱敏诊断', admissionState: 'admitted', admissionDate: '2026-08-01',
  surgeryDate: '2026-08-02', plannedDischargeDate: '2026-08-03', surgeryName: '脱敏拟行术式',
  surgeon: '虚拟主刀', allergyStatus: 'none', createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-08-02T01:00:00.000Z',
};

const v11 = {
  schemaVersion: 11,
  settings: { activeDepartment: '整形外科', departments: ['整形外科'] },
  patients: [
    {
      ...basePatient, id: 'PREOP-ACTIVE-001', name: '虚拟患者甲',
      confirmedSurgeryName: '脱敏正式术式', surgeryNameConfirmedAt: '2026-08-01T02:00:00.000Z',
      preopChecks: {
        surgeryNameConfirmed: '2026-08-01T02:00:00.000Z', consentSigned: '2026-08-01T03:00:00.000Z',
        testsReviewed: '2026-08-01T04:00:00.000Z', historySigned: '2026-08-01T05:00:00.000Z', photosCompleted: '2026-08-01T06:00:00.000Z',
      },
    },
    {
      ...basePatient, id: 'PREOP-ACTIVE-002', name: '虚拟患者乙', confirmedSurgeryName: '', surgeryNameConfirmedAt: '',
      preopChecks: { surgeryNameConfirmed: '2026-08-01T07:00:00.000Z' },
    },
  ],
  archivedPatients: [{
    ...basePatient, id: 'PREOP-ARCHIVED-001', name: '虚拟患者丙', archived: true, archivedAt: '2026-08-04T01:00:00.000Z',
    actualDischargeDate: '2026-08-03', preopChecks: { consentSigned: '2026-08-01T08:00:00.000Z' },
  }],
  rounds: [], tasks: [], taskDrafts: [], stageLogs: [], devices: [], observations: [], pathologySpecimens: [],
  clinicalEvents: [],
  revokedRegistrations: [{
    id: 'REVOKED-PREOP-001', revokedAt: '2026-08-02T09:00:00.000Z',
    patient: {
      ...basePatient, id: 'PREOP-REVOKED-001', name: '虚拟患者丁',
      preopChecks: { photosCompleted: '2026-08-01T09:00:00.000Z', historySigned: '2026-08-01T10:00:00.000Z' },
    },
    records: { rounds: [], tasks: [], taskDrafts: [], stageLogs: [], devices: [], observations: [], clinicalEvents: [], pathologySpecimens: [] },
  }],
  meta: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' },
};

const migrated = store.prepareBackupImport(v11);
assert.equal(migrated.sourceSchemaVersion, 11);
assert.equal(migrated.targetSchemaVersion, 13);
assert.equal(migrated.integrity.ok, true);
assert.equal(migrated.workspace.schemaVersion, 13);

const allPatients = [...migrated.workspace.patients, ...migrated.workspace.archivedPatients, ...migrated.workspace.revokedRegistrations.map((entry) => entry.patient)];
assert.equal(allPatients.every((patient) => !('preopChecks' in patient)), true, 'v12 患者主记录不得继续保存通用术前核查对象');

const confirmed = migrated.workspace.patients.find((patient) => patient.id === 'PREOP-ACTIVE-001');
assert.equal(confirmed.confirmedSurgeryName, '脱敏正式术式');
assert.equal(confirmed.surgeryNameConfirmedAt, '2026-08-01T02:00:00.000Z');
const nameMissing = migrated.workspace.patients.find((patient) => patient.id === 'PREOP-ACTIVE-002');
assert.equal(nameMissing.confirmedSurgeryName, '');
assert.equal(nameMissing.surgeryNameConfirmedAt, '', '没有正式术式名称时不得仅凭旧勾选推断已确认');

const events = migrated.workspace.clinicalEvents;
assert.equal(events.some((event) => event.patientId === 'PREOP-ACTIVE-001' && event.type === 'surgery-name-confirmed' && event.value === '脱敏正式术式'), true);
['consentSigned', 'testsReviewed', 'historySigned'].forEach((key) => {
  assert.equal(events.some((event) => event.patientId === 'PREOP-ACTIVE-001' && event.type === 'legacy-preop-check' && event.value === key), true);
});
assert.equal(events.some((event) => event.patientId === 'PREOP-ACTIVE-001' && event.type === 'cooperation-photo'), true);
assert.equal(events.some((event) => event.patientId === 'PREOP-ACTIVE-002' && event.type === 'legacy-preop-check' && event.value === 'surgeryNameConfirmed'), true);
assert.equal(events.some((event) => event.patientId === 'PREOP-ARCHIVED-001' && event.type === 'legacy-preop-check' && event.value === 'consentSigned'), true);

const revokedEvents = migrated.workspace.revokedRegistrations[0].records.clinicalEvents;
assert.equal(revokedEvents.some((event) => event.type === 'cooperation-photo'), true);
assert.equal(revokedEvents.some((event) => event.type === 'legacy-preop-check' && event.value === 'historySigned'), true);
assert.deepEqual(migrated.workspace.meta.preopMigration, {
  fromSchemaVersion: 11,
  patientCount: 4,
  eventCount: 9,
  migratedAt: migrated.workspace.meta.preopMigration.migratedAt,
});

const repeated = store.prepareBackupImport(structuredClone(migrated.workspace));
assert.equal(repeated.workspace.clinicalEvents.length, migrated.workspace.clinicalEvents.length, 'v12 数据重复规范化不得产生迁移事件');
assert.equal(repeated.workspace.revokedRegistrations[0].records.clinicalEvents.length, revokedEvents.length);
assert.equal(new Set(repeated.workspace.clinicalEvents.map((event) => event.id)).size, repeated.workspace.clinicalEvents.length);

storage.set(store.workspaceStorageKeys().current, structuredClone(v11));
const automaticallyMigrated = store.getWorkspace();
assert.equal(automaticallyMigrated.schemaVersion, 13);
assert.deepEqual(storage.get(store.workspaceStorageKeys().preopMigrationSnapshot), v11, '自动迁移前必须保留原始 v11 本机快照');
assert.equal(store.getBackupSummary(automaticallyMigrated).preopMigration.patientCount, 4);

console.log('v11 preoperative checklist to v12 event migration: passed');
