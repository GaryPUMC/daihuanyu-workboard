export function getDatedBackupFileName(dateKey) {
  const compactDate = `${dateKey || ''}`.replace(/-/g, '');
  if (!/^\d{8}$/.test(compactDate)) throw new Error('备份日期格式无效');
  return `代寰宇的工作板加密备份_${compactDate}.dhwb`;
}
