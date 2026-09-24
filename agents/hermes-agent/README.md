# Hermes 客户端（开发骨架）

> **这是开发骨架（SKELETON）。** 它长期承载未来的 **Hermes 客户端**职责，但**当前尚未接入**：不连接任何 Hermes 端点、不调用模型、不做任何推理或请求。界面只如实显示「Hermes 尚未接入」。

这是 `aka-rokid-aiui` monorepo 中一个**可独立导入 AIUI Studio** 的自包含 Agent。它与 `system-diagnostics`（设备系统测试）和 `combat-power-detector`（战斗力检测器产品原型）**边界明确、各自自包含、互不 import**。

> 独立导入：在 AIUI Studio 用 **Import from Github** 指向 `BakaAkari/aka-rokid-aiui` 的 `agents/hermes-agent`，或用 **Import from local folder** 指向本目录。本目录不依赖任何仓库外文件或软链。

## 操作模型（硬约束）

- **语音唤起**应用；唯一物理操作是**确认键**。不依赖方向键、触摸或菜单选择。
- 页面只有一个当前动作，无可选择标签、无方向键导航、无并列功能入口。
- **确认键**：查看/刷新接入状态。Enter / GlobalHook 均视为确认。

## 当前状态（诚实）

- **Hermes 尚未接入**。本骨架不连接任何端点、不调用模型、不做推理，也不伪造可用 API。
- 未来接入 Hermes 需另立实现并重新标注，不属于当前骨架。

## 屏幕布局（480×352 单绿屏）

- 顶部：标题「Hermes 客户端」。
- 顶部下方：「SKELETON — Hermes 尚未接入，未连接任何端点」标注。
- 中部：状态（Hermes 尚未接入）+ 详情（Hermes 客户端尚未接入，未连接任何端点）。
- 中部下方：当前任务、能力可用（否）。
- 底部：固定唯一操作提示「确认：刷新状态」，不与文字重叠。

## 边界（重要）

- 本 Agent **不**承载 `system-diagnostics` 的设备能力诊断；不报告设备能力 `ok/unsupported/failed`。
- 本 Agent **不**承载"战斗力检测器"产品原型；不检测相机视觉状态。
- 三者均为独立、自包含的 Agent，互不 import。

## 隐私与安全

- 本骨架不发起任何网络请求，不读取响应正文。
- 不记录 deviceId、序列号、token、Hermes key、private IP。
- 无 Hermes 集成，无在线端点。

## 开发与校验（本目录内独立）

```bash
npm test           # 纯函数单测（诚实连接状态）
npm run validate   # 静态校验（确认键单页、诚实"尚未接入"标记、无网络调用、无私网IP/密钥）
npm run package:aix # 仅结构校验 + 本地源码 zip（非 Studio .aix 二进制）
```

真机验证步骤见 `docs/DEVICE_TEST.md`。