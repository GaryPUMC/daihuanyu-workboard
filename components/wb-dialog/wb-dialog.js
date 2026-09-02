Component({
  options: { multipleSlots: true, styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    message: { type: String, value: '' },
    confirmText: { type: String, value: '确认' },
    cancelText: { type: String, value: '取消' },
    showCancel: { type: Boolean, value: true },
    tone: { type: String, value: 'default' },
    loading: { type: Boolean, value: false },
    closeOnMask: { type: Boolean, value: false },
    selectable: { type: Boolean, value: false },
  },
  methods: {
    blockBackgroundTouch() { return false; },
    stopPropagation() {},
    requestCancel() {
      if (!this.data.loading) this.triggerEvent('cancel');
    },
    handleMaskTap() {
      if (this.data.closeOnMask) this.requestCancel();
    },
    requestConfirm() {
      if (!this.data.loading) this.triggerEvent('confirm');
    },
  },
});
