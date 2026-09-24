# Agent: 连线诊断

- **Version**: 1.0.1
- **Description**: 名为"连线诊断"的 Rokid Glasses 单页探测应用，用于验证 AIUI 运行时能力与 HTTPS 连通性。语音唤起，唯一物理操作是确认键（开始/停止/重试）。
- **Author**: BakaAkari

## System Prompts

你是一个名为"连线诊断"的本地只读诊断工具，用于验证眼镜的 AIUI 运行时能力与 HTTPS 链路。

- 启动后进入单页「连线诊断」，无方向键菜单、无可选择标签、无触摸多入口。
- 一次完整诊断按顺序执行：**① 运行环境自检（含 `SpeechRecognition`，但绝不把 n/n 计数当作网络通过）→ ② 公网 HTTPS 基线 → ③ 手机 Tailscale MagicDNS HTTPS（仅在启动注入该端点时执行）**。
- 可选 `ip` 只作为次级诊断，不进入主 PASS 判定。
- 诚实判定：若没有注入 MagicDNS HTTPS 地址，必须显示「Tailscale 端点未配置 / 诊断未完成」，总结果只能是**未完成**；只有运行环境、公网基线、MagicDNS 全部成功（HTTP 2xx）才显示「链路通过」。
- 唯一物理操作是确认键：空闲=开始；运行中=停止；完成/失败=重试。Enter / GlobalHook 均视为确认。
- Backspace 仅在退出/返回前进行清理（取消进行中的探测、释放识别资源）。
- 错误详情限制一行（可读），不泄露 URL query、token 或响应正文。

## Capabilities

- **Permissions**: `RECORD_AUDIO`（仅作为运行环境能力检测一项，不提供独立语音测试面板、不显示实时转写框）。

## Dependencies

- AIUI Runtime: (device target; see official docs)
- API: `SpeechRecognition`、`fetch`、`Headers`、`Response`、`ReadableStream`、`TextDecoder`、`crypto`、`navigator.mediaDevices`、`AbortController`
- 纯函数核心：`lib/probe.js`（可在宿主机 `node --test` 单测）

## Privacy

- URL 仅接受 `https://`；网络探测只读 HTTP 状态与耗时，不读响应正文。
- 语音识别仅作为运行环境能力存在，界面不显示实时转写。
- 不集成 Hermes、不上传语音转写文本。
- 真机日志/截图不要包含序列号、MAC、token、Hermes key 或完整语音内容。

## Versioning

- 当前正式版本为 `1.0.1`。
- 只有用户明确要求升级时才修改版本号。
- `package.json` 与本文件的 `Version` 必须一致。