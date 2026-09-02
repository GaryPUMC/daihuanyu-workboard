Component({
  options: { multipleSlots: true, styleIsolation: 'apply-shared' },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    confirmText: { type: String, value: '保存' },
    cancelText: { type: String, value: '取消' },
    keyboardHeight: { type: Number, value: 0 },
    loading: { type: Boolean, value: false },
    dirty: { type: Boolean, value: false },
    closeOnMask: { type: Boolean, value: false },
    scrollIntoView: { type: String, value: '' },
  },
  data: { discardPending: false },
  observers: {
    visible(visible) { if (!visible && this.data.discardPending) this.setData({ discardPending: false }); },
  },
  methods: {
    blockBackgroundTouch() { return false; },
    stopPropagation() {},
    requestCancel() {
      if (this.data.loading) return;
      if (this.data.dirty && !this.data.discardPending) return this.setData({ discardPending: true });
      this.triggerEvent('cancel');
    },
    continueEditing() { this.setData({ discardPending: false }); },
    discardChanges() { this.setData({ discardPending: false }); this.triggerEvent('cancel'); },
    handleMaskTap() {
      if (this.data.closeOnMask) this.requestCancel();
    },
    requestConfirm() {
      if (!this.data.loading) this.triggerEvent('confirm');
    },
  },
});
