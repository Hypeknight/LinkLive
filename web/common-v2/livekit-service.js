(function () {
  const lk = window.LinkdNLiveKit;

  window.LinkdNV2LiveKitService = {
    ensure() {
      if (!lk) throw new Error('LinkdNLiveKit is not available.');
      return lk;
    },
    async connect(opts) {
      return this.ensure().connect(opts);
    },
    async disconnect() {
      return this.ensure().disconnect?.();
    },
    async createAndPublishLocalTracks(opts) {
      return this.ensure().createAndPublishLocalTracks(opts);
    },
    attachLocalPreview(el) {
      return this.ensure().attachLocalPreview?.(el);
    },
    getRoom() {
      return this.ensure().getRoom?.();
    },
    onTrackSubscribed(handler) {
      return this.ensure().onTrackSubscribed?.(handler);
    },
    onTrackUnsubscribed(handler) {
      return this.ensure().onTrackUnsubscribed?.(handler);
    },
    async listDevices() {
      return this.ensure().listDevices?.();
    }
  };
})();
