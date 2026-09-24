# 战斗力检测器（原型）

> **本项目是原型（PROTOTYPE）。** 它只验证眼镜的**相机能力与视觉状态**（相机 API 是否存在、权限是否授予、是否取得实时画面、快照尺寸）。**它不做**真实战斗/身份/健康判断，界面上如实标注「原型」。

这是 `aka-rokid-aiui` monorepo 中一个**可独立导入 AIUI Studio** 的自包含 Agent。

> 独立导入：在 AIUI Studio 用 **Import from Github** 指向 `BakaAkari/aka-rokid-aiui` 的 `agents/combat-power-detector`，或用 **Import from local folder** 指向本目录。本目录不依赖任何仓库外文件或软链。

## 操作模型（硬约束）

- **语音唤起**应用；唯一物理操作是**确认键**。不依赖方向键、触摸或菜单选择。
- 页面只有一个当前动作，无可选择标签、无方向键导航、无并列功能入口。
- **确认键**：空闲=开始；运行中=停止；完成/失败=重试。Enter / GlobalHook 均视为确认。
- **Backspace** 仅在退出/返回前清理（停止并释放相机媒体轨）。

## 检测流程（单确认驱动）

一次检测按顺序执行：

1. **① 相机 API 探测**：`navigator.mediaDevices.getUserMedia` / `ImageCapture` /（可选回退）`wx.media.createCameraContext` 是否存在。
2. **② 权限**：调用 `getUserMedia({ video: true })` 请求相机（`CAMERA` 权限）。
3. **③ 实时画面**：确认取到一条 `readyState === 'live'` 的视频轨。
4. **④ 快照证据（可选）**：用 `ImageCapture.takePhoto` 取一张图，只记录字节数与 MIME；照片字节**不保存、不上传、不打印**。

> **诚实判定**：只有真实获得一条 `live` 视频轨，才显示「相机可用（原型）」。权限被拒、没有相机设备、或虽调用成功但无 live 视频轨，都**不算**成功，并显示对应失败原因。

## 屏幕布局（480×352 单绿屏）

- 顶部：标题「战斗力检测器」。
- 顶部下方：醒目的「原型 / PROTOTYPE」标注。
- 中部：总体状态（待检测 / 检测中 / 相机可用（原型） / 失败 / 已停止）。
- 中部下方：最多四条步骤（相机 API / 权限 / 实时画面 / 快照证据）。
- 底部：固定唯一操作提示「确认：开始 / 停止 / 重试」，不与检测文字重叠。
- 错误详情限制**一行**，不泄露设备标识或照片内容。

## 原型边界（重要）

- 名称虽为"战斗力检测器"，但**不进行**任何人体/身份/危险/杀伤力判断，**不给出**"战斗力数值"。
- 它只是探针：证明相机可用、权限可授予、能取到实时画面。真正基于视觉内容的分析需要离线或 Hermes 视觉模型，属于**未来工作**，不属于当前原型。

## 隐私与安全

- 相机仅在确认键动作且权限已声明后使用；用毕立即 `track.stop()`。
- 不保存、不上传照片字节；不显示实时取景画面。
- 不做人体/身份/危险判断。
- URL/逻辑不接受任何私网 IP 或密钥；无 Hermes 集成。

## 参考：AIUI 相机 API（官方）

- Media Capture：`navigator.mediaDevices.getUserMedia`、`ImageCapture`、`MediaRecorder`、`wx.media.createCameraContext`。
- 权限在 `app.json` 的 `permissions` 中声明（相机用 `CAMERA`）。
- 官方文档：
  - https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/media/media-capture.en-US.md
  - https://github.com/yodaos-project/AIUI

## 开发与校验（本目录内独立）

```bash
npm test           # 纯函数单测
npm run validate   # 静态校验（确认键单页、CAMERA 权限、诚实判定、原型标注、不存照/不上传、无私网IP/密钥）
npm run package:aix # 仅结构校验 + 本地源码 zip（非 Studio .aix 二进制）
```

真机验证步骤见 `docs/DEVICE_TEST.md`。

## 与系统测试的边界

- 本 Agent 是**战斗力检测器产品原型**：只检测**相机可用性与视觉状态**，为未来的视觉/姿态/游戏化体验打基础。
- **完整设备能力测试系统**（运行时基础 API / 语音识别 zh-CN / 相机 / 扬声器·语音合成 / 公网 HTTPS 基线的 `ok/unsupported/failed` 报告）已迁出，归属独立 Agent **`agents/system-diagnostics`（系统测试，v0.2.0）**。本 Agent 不跨目录 import、不引用该系统测试。
- 设备能力 `ok / unsupported / failed` 的结论**只有** `system-diagnostics` 能报告；本 Agent 只报告相机视觉结果。