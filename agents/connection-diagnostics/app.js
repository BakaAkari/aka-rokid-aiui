export default {
  onLaunch() {
    console.log('[连线诊断] App Launch');
  },
  onShow() {
    console.log('[连线诊断] App Show');
  },
  onHide() {
    console.log('[连线诊断] App Hide');
  },
  onError(error) {
    console.log('[连线诊断] App Error:', error);
  },
  globalData: {
    version: '1.0.1'
  }
};