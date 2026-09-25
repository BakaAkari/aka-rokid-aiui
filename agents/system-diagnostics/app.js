export default {
  onLaunch() {
    console.log('[应用测试] App Launch');
  },
  onShow() {
    console.log('[应用测试] App Show');
  },
  onHide() {
    console.log('[应用测试] App Hide');
  },
  onError(error) {
    console.log('[应用测试] App Error:', error);
  },
  globalData: {
    version: '0.2.1'
  }
};