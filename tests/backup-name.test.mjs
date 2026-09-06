import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../utils/backup-name.js', import.meta.url), 'utf8');
const backupName = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

assert.equal(backupName.getDatedBackupFileName('2026-09-06'), '代寰宇的工作板加密备份_20260906.dhwb');
assert.throws(() => backupName.getDatedBackupFileName('2026/09/06'), /备份日期格式无效/);

console.log('dated encrypted backup filename: passed');
