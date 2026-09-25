# 应用测试（设备系统测试）

> **这是设备系统测试（SYSTEM TEST）。** 它是一次**设备能力诊断**：一次确认键按顺序测试眼镜的重要运行时与设备能力（运行时/AIUI 基础 API、语音识别 zh-CN、相机、扬声器/语音合成、公网 HTTPS 基线）。**它不做**真实战斗/身份/健康判断，也**不计算**任何"战斗力数值"，每项能力如实标 `ok / unsupported / failed`。

这是 `aka-rokid-aiui` monorepo 中一个**可独立导入 AIUI Studio** 的自包含 Agent。本 Agent 承载**完整设备能力测试系统**，与"战斗力检测器"（产品原型）和未来 Hermes Agent 明确区分。

> 独立导入：在 AIUI Studio 用 **Import from Github** 指向 `BakaAkari/aka-rokid-aiui` 的 `agents/system-diagnostics`，或用 **Import from local folder** 指向本目录。本目录不依赖任何仓库外文件或软链。

## 操作模型（硬约束）

- 对眼镜说 **“应用测试”** 唤醒应用；唯一物理操作是**确认键**。不依赖方向键、触摸或菜单选择。
- 页面只有一个当前动作，无可选择标签、无方向键导航、无并列功能入口。
- **确认键**：空闲=开始；运行中=停止；完成/失败=重试。Enter / GlobalHook 均视为确认。
- **Backspace** 仅在退出/返回前清理（停止并释放相机媒体轨、语音识别与网络请求）。

## 诊断流程（单确认驱动）

一次诊断按固定顺序执行五项：

1. **① 运行时基础 API**：`fetch`、`AbortController`、`crypto.randomUUID`、`ReadableStream`、`TextDecoder`、`navigator.mediaDevices`。每项区分 `ok / unsupported / failed`，并显示 `n/n` 计数。
2. **② 语音识别 zh-CN**：声明 `RECORD_AUDIO`。确认后请求并启动一次 `SpeechRecognition` 会话（`lang='zh-CN'`）。显示权限/启动/最终结果状态，**只正确使用 `result.isFinal`** 判定最终结果；不把实时转写全文持久化或上屏堆叠，最终短状态即可。
3. **③ 相机**：声明 `CAMERA`。确认后 `getUserMedia({ video: true })`，只有取到一条 `readyState === 'live'` 的视频轨才算 `ok`；照片字节**不保存、不上传、不打印**，只显示轨道尺寸。
4. **④ 扬声器/语音合成**：声明能力（官方 `speechSynthesis` / `SpeechSynthesisUtterance`）。**仅安全探测表面存在与否**，不自动播放——若当前运行时不暴露该表面则显示 `unsupported`，不编造。
5. **⑤ 公网 HTTPS 基线**：声明 `INTERNET`。对 `https://js.rokid.com/` 发起探测，只读取**状态码 + 耗时**，**不读响应正文**。

> **诚实判定**：总结果只能是「设备能力诊断完成」/「部分通过」/「失败」/「未完成」之一。**绝不**声明"所有硬件已通过"，**绝不**计算真实战斗力数值。每项能力如实标 `ok / unsupported / failed`。

## 屏幕布局（480×352 单绿屏）

- 顶部：标题「应用测试」+「设备能力诊断 · v0.2.3」。
- 顶部下方：醒目的「SYSTEM TEST — 仅在测设备能力，不判断战斗/身份/健康」标注。
- 中部：总体状态（未开始 / 诊断中… / 设备能力诊断完成 / 部分通过 / 诊断失败 / 诊断未完成）。
- 中部下方：最多五行紧凑步骤（运行时 / 语音zh-CN / 相机 / 扬声器/合成 / 公网HTTPS）。
- 底部：固定唯一操作提示「确认：开始 / 停止 / 重试」，不与检测文字重叠。
- 错误详情限制**一行**，不泄露设备标识、照片字节、完整转写或响应正文。

## 测试边界（重要）

- 本 Agent 是**设备系统测试**：证明运行时基础 API 是否可用、语音识别能否闭环、相机能否取到实时画面、语音合成表面是否存在、公网 HTTPS 是否可达。
- 本 Agent **不**判断人体/身份/危险/杀伤力，**不给出**"战斗力数值"。
- 本 Agent **不**承载"战斗力检测器"产品原型。原型只是对已验证设备能力进行视觉/姿态/游戏化体验；若未来接入离线或 Hermes 视觉/语义模型，需另立为独立能力并重新标注，不属于本系统测试。
- 当前会话只能**报告设备能力诊断结果**；只有系统测试 Agent 才报告设备能力 `ok / unsupported / failed`。

## 隐私与安全

- 相机与录音仅在确认键动作且权限已声明后使用；用毕立即停止释放（`track.stop()`、`recognition.abort()`）。
- **不**保存、上传、打印照片字节或完整语音转写；**不**显示实时取景画面；最终语音状态为短标签而非全文。
- 网络探测只读 HTTP 状态与耗时，**不读响应正文**。
- 不记录 deviceId、序列号、token、Hermes key、private IP。
- URL/逻辑不接受任何私网 IP 或密钥；无 Hermes 集成。

## 参考：AIUI 官方 API

- 语音识别：`SpeechRecognition`（`result.isFinal`、`onstart/onresult/onerror/onend`）；`SpeechRecognitionSession` 用于外部音频。
- 语音合成：`speechSynthesis.speak()` / `SpeechSynthesisUtterance`。
- 媒体采集：`navigator.mediaDevices.getUserMedia`、`ImageCapture`、`MediaRecorder`、`wx.media.createCameraContext`。
- 权限在 `app.json` 的 `permissions` 中声明（本应用用 `RECORD_AUDIO` + `CAMERA` + `INTERNET`）。
- 官方文档：
  - https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/ai/speech-recognition.md
  - https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/ai/speech-synthesis.md
  - https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/media/media-capture.en-US.md
  - https://github.com/yodaos-project/AIUI

## 开发与校验（本目录内独立）

```bash
npm test           # 纯函数单测
npm run validate   # 静态校验（确认键单页、三大权限与用途、诚实判定、result.isFinal、不读响应体/敏感数据、无私网IP/密钥）
npm run package:aix # 仅结构校验 + 本地源码 zip（非 Studio .aix 二进制）
```

真机验证步骤见 `docs/DEVICE_TEST.md`。