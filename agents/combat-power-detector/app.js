export default {
  onLaunch() {
    console.log('[战斗力检测] App Launch');
  },
  onShow() {
    console.log('[战斗力检测] App Show');
  },
  onHide() {
    console.log('[战斗力检测] App Hide');
  },
  onError(error) {
    console.log('[战斗力检测] App Error:', error);
  },
  globalData: {
    version: '0.1.0'
  }
};