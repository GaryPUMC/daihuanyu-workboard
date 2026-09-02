export function emptyDialog() {
  return { visible: false, title: '', message: '', confirmText: '确认', cancelText: '取消', showCancel: true, tone: 'default', selectable: false, loading: false, action: '', payload: null };
}

export function createDialog(config = {}) {
  return { ...emptyDialog(), ...config, visible: true };
}
