# 连线诊断

用于验证 Rokid Glasses（YODAOS-Sprite）上的 AIUI 运行时能力与 HTTPS 连通性。应用被**语音唤起**，界面收敛为**单页「连线诊断」**。这是 `aka-rokid-aiui` monorepo 中一个**可独立导入 AIUI Studio** 的自包含 Agent。

> 独立导入：在 AIUI Studio 用 **Import from Github** 指向 `BakaAkari/aka-rokid-aiui` 的 `agents/connection-diagnostics`，或用 **Import from local folder** 指向本目录。本目录不依赖任何仓库外文件或软链。

## 操作模型（硬约束）

所有眼镜功能以**语音交互**为主，唯一物理操作是**确认键**：

- **不依赖**方向键、上下键、触摸或菜单选择。
- 页面始终只有一个**当前动作**，没有可选择标签、方向键导航或并列功能入口。
- **确认键**：空闲时开始；运行中时停止；完成/失败后重试。
- **Enter / GlobalHook** 均视为确认；其他按键不承担任何选择。
- **Backspace** 仅在退出/返回前进行清理（取消进行中的探测、释放识别资源）。

一次完整诊断按顺序执行三步：

1. **运行环境**（运行时能力自检，含 `SpeechRecognition` 一项）。用「运行环境」显示，**绝不把 9/9 之类计数当作网络通过**。
2. **公网 HTTPS 基线**。
3. **手机 Tailscale MagicDNS HTTPS**（仅在启动时注入了该端点时才执行）。

可选 `ip` 只作为**次级诊断**，不进入主 PASS 判定（公网证书通常不覆盖 IP 字面量，TLS 失败不能单独证明 tailnet 路由不通）。

> **诚实判定**：若**没有**注入 MagicDNS HTTPS 地址，必须明确显示「Tailscale 端点未配置 / 诊断未完成」，总结果只能是**未完成**——绝不能因为 9/9 或公网成功就显示 PASS。**已注入**时，只有运行环境、公网基线、MagicDNS 全部成功才显示「链路通过」。

## 屏幕布局（480×352 单绿屏）

- 顶部：标题「连线诊断」。
- 中部：总体状态（未开始 / 运行中 / 链路通过 / 诊断失败 / 诊断未完成）。
- 中部下方：最多三条核心步骤（运行环境 / 公网 / 手机Tailscale）；可选 Tailscale IP 以次级行显示。
- 底部：固定唯一的操作提示「确认：开始 / 停止 / 重试」，不与诊断文字重叠。
- 错误详情限制**一行**（可读），不泄露 URL query、token 或响应正文。

## 启动参数

只接受 `https://` 端点；不硬编码任何真实私网 IP、域名、token 或 Hermes key，这些由调用方在启动时通过 query 提供。兼容 `baseline` / `magicdns` / `ip` / `url`：

```
?baseline=https://js.rokid.com/&magicdns=https://<magicDNS域名>.ts.net/&ip=https://100.x.x.x/
```

- `baseline` / `url`：公网基线（缺省用官方公网端点 `https://js.rokid.com/`）。
- `magicdns`：必须提供才能进入主链路判定；**未提供时总结果为「诊断未完成」**。
- `ip`：可选，仅作次级诊断，不参与主判定。

`npm test` 和静态校验只证明源码逻辑与包结构；它们不证明目标眼镜的语音服务、权限、手机代理网络或显示效果。

## 隐私与安全

- URL 仅接受 `https://`；http 与无协议地址被拒绝。
- 网络探测只读取 HTTP 状态与耗时，**不读取响应正文**（避免 token、完整语音等敏感数据上屏/落日志）。
- 语音识别仅作为运行环境能力的一项存在，界面不提供独立语音测试面板、不显示实时转写框。
- 不集成 Hermes、不上传语音转写文本。

## 开发与校验（本目录内独立）

```bash
npm test           # 纯函数单测
npm run validate   # 静态校验（确认键单页、诚实判定、https 门控、不读响应体、无私网IP）
npm run package:aix # 仅结构校验 + 本地源码 zip（非 Studio .aix 二进制）
```

官方参考：

- https://github.com/yodaos-project/AIUI
- https://github.com/yodaos-project/AIUI/blob/main/documentation/3-api/ai/speech-recognition.md
- https://github.com/yodaos-project/AIUI/blob/main/documentation/0-guide/basic/network/usage.md

真机验证步骤见 `docs/DEVICE_TEST.md`。