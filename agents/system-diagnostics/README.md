# 应用测试：Rokid Glasses 完整能力基线

版本：`0.3.0`

这是 `aka-rokid-aiui` 的设备能力基石。一次确认键顺序执行 AIUI 应用层公开能力清单；结果自动翻页，不需要方向键或触摸。

## 结果证据等级

- `实证 verified`：本轮取得真实返回或完成闭环。
- `表面 surface`：接口存在，但缺少外部样本/服务或完成事件。
- `不支持 unsupported`：当前运行时没有该公开 API。
- `无接口 unavailable`：能力可能存在于硬件或 CXR-S/Native 层，但 AIUI 页面没有公开入口。
- `失败 failed`：接口存在但调用、权限、采样或超时失败。
- `未执行 not-run`：需要 BLE 外设、样本或人工对照，本轮没有安全执行。

顶部只显示覆盖摘要，例如：`已执行 31/33 · 实证 20 · 表面 6 · 失败 1`，不再显示“全部核心能力已通过”。

## 33 项 / 10 类覆盖

- 运行时：核心对象、流与编码、时钟与性能。
- 显示交互：视口、Canvas、确认键、页面生命周期。
- 音频 AI：麦克风 zh-CN、SpeechRecognitionSession、真实 TTS 播放、Web Audio、AudioPlayer、LanguageModel。
- 视觉：相机实时视频轨、ImageCapture、BarcodeDetector 格式。
- 传感器：Accelerometer、Gyroscope、AbsoluteOrientationSensor。
- 设备信息：BatteryManager、非敏感环境字段、Geolocation。
- 连接：蓝牙可用性、BLE 外设连接边界。
- 网络：HTTPS、WebSocket、SSE、Mobile Proxy 对照边界。
- 存储：localStorage、IndexedDB、OPFS。
- 原生层边界：CXR-S 裸机能力，以及序列号/温度/存储量等 AIUI 无公开安全 API 的项目。

## 真机闭环标准

- 语音：取得非空 `result.isFinal` 才是实证。
- 相机：取得 `readyState === 'live'` 的视频轨才是实证。
- TTS：真实播放“音频输出测试”；收到完成事件才是实证，无完成事件只标表面并要求听感确认。
- IMU：限时内收到有效三轴或四元数读数。
- 电池：真实取得电量与充电状态。
- 定位：真实取得位置，但不显示/保存经纬度，只显示精度。
- 网络：真实取得公网 2xx，不读取响应正文。
- 存储：仅用固定临时哨兵值执行写入、读取、删除。

## 隐私与安全

不显示或保存设备唯一标识、序列号、MAC、精确坐标、完整语音转写、照片字节、条码内容、响应正文、密钥或私网地址。

## 官方来源

能力目录来自 `yodaos-project/AIUI` 官方仓库：

- `documentation/3-api/device/*`
- `documentation/3-api/geo-data/geolocation.md`
- `documentation/3-api/ai/*`
- `documentation/3-api/media/*`
- `documentation/3-api/network/*`
- `documentation/3-api/storage*`
- `documentation/3-api/canvas/index.md`
- `documentation/1-framework/open-agent-format/page-lifecycle.md`
- `documentation/0-guide/basic/{device,network,storage,canvas}/*`

覆盖范围是 **AIUI 应用层公开能力**。CXR-S/原生层能力会进入矩阵但标记为“无接口”，不会用 AIUI 页面伪造验证。
