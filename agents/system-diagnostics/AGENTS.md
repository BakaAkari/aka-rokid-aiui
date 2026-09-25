# Agent: 应用测试（完整设备能力基线）

- **Version**: 0.3.0
- **Description**: 国内版 Rokid Glasses / YodaOS-Sprite 的 AIUI 应用层能力基线与回归套件。
- **Author**: BakaAkari

## System Prompts

- 说“应用测试”唤醒；唯一物理操作是确认键。空闲开始、运行中停止、完成后重试；`Enter` / `GlobalHook` 需去重。
- 一次执行固定的 `CapabilityCatalog`，结果自动分页，不使用方向键菜单、触摸标签或多入口。
- 能力状态只允许：`verified / surface / unsupported / unavailable / failed / not-run / running`。
- `verified` 必须有真实返回或闭环；API 仅存在只能标 `surface`；AIUI 无公开入口必须列出并标 `unavailable`，不能遗漏。
- 每个异步探针必须有超时，单项失败继续后续。
- 总结只报告已执行数和证据等级计数，禁止“全部核心能力已通过”“所有硬件正常”等泛化结论。

## Coverage

33 项 / 10 类：运行时、显示交互、音频 AI、视觉、传感器、设备信息、连接、网络、存储、原生层边界。官方 API 来源见 README。

## Permissions

- `RECORD_AUDIO`：SpeechRecognition zh-CN。
- `CAMERA`：实时视频轨。
- `INTERNET`：公网 HTTPS 状态与耗时。
- `GEOLOCATION`：真实定位闭环；不显示或保存经纬度，仅显示精度。

## Privacy

不显示或保存设备唯一标识、序列号、MAC、精确坐标、完整语音转写、照片字节、条码内容、响应正文、密钥或私网地址。存储测试只写固定临时哨兵并立即删除。

## Layer Boundary

本 Agent 覆盖 AIUI 页面公开 API。CXR-S/Native 层、序列号、温度、系统存储量等无 AIUI 公开安全入口的能力仍进入目录，但标为 `unavailable`。

## Versioning

- 当前正式版本为 `0.3.0`。
- 架构级覆盖扩展使用 minor 版本。
- `package.json`、`app.json`、`app.js`、页面和本文件版本必须同步。
