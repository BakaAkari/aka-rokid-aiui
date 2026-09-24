export default {
  onLaunch() {
    console.log('[系统测试] App Launch');
  },
  onShow() {
    console.log('[系统测试] App Show');
  },
  onHide() {
    console.log('[系统测试] App Hide');
  },
  onError(error) {
    console.log('[系统测试] App Error:', error);
  },
  globalData: {
    version: '0.2.0'
  }
};