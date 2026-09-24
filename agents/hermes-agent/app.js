export default {
  onLaunch() {
    console.log('[Hermes] App Launch');
  },
  onShow() {
    console.log('[Hermes] App Show');
  },
  onHide() {
    console.log('[Hermes] App Hide');
  },
  onError(error) {
    console.log('[Hermes] App Error:', error);
  },
  globalData: {
    version: '0.1.0'
  }
};