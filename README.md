# AI 额度桌面小组件

适用于 iPhone Scriptable 小号方形组件，无需自己的服务器。

- DeepSeek余额.js：蓝白主题，官方鲸鱼图标，显示可用、充值及赠送余额。
- MiniMax订阅.js：橙红与暖白主题，国内 minimax.cn 订阅，显示文本模型 5 小时／每周剩余额度和重置时间。

## 安装

将脚本导入 Scriptable，在 App 内运行并输入各自的 Key。添加 Scriptable 小号桌面组件，选择对应脚本，点击动作选择 Run Script。

DeepSeek 和 MiniMax 的密钥分别保存在钥匙串，不随脚本上传，也不写入缓存。不要把密钥写进 GitHub。

## 网络与缓存

DeepSeek 仅向 api.deepseek.com/user/balance 发送认证请求。官方鲸鱼从 DeepSeek 官方 SVG 路径转换成蓝色 PNG，首次从本仓库 assets 下载，下载不携带密钥，并长期本地缓存。失败会在 App 详情中提示。

MiniMax 仅向 https://www.minimax.cn/v1/token_plan/remains 发送订阅 Key。不调用模型、不发送提示词。界面文字标识不下载第三方图片。

数据缓存五分钟，实际刷新由 iOS 调度，显示实际获取时间。离线保留缓存，不把旧额度自动重置为满额。

MiniMax 优先使用 general 文本额度，缺少明确的剩余百分比时显示“未提供”，不从含义不清的 usage_count 推算。接口响应可在 App 详情中本地查看，不含请求头。未统计每日原始 Token 或人民币消费。

## 验证

已通过 JavaScript 语法检查及 MiniMax 额度解析样本检查。未进行 iPhone 真机视觉验证，也未用真实订阅 Key 验证账号返回数据。

## Codex（实验性）

Codex用量.js 使用 ChatGPT 客户端内部 GET /backend-api/wham/usage 接口；非公开稳定 REST API。仅支持手机本地输入自己的 Access Token 与可选 Account ID，钥匙串保存。不是 Session Cookie 登录，不支持设备码或自动续期。凭证仅发送至 chatgpt.com。缺失字段不当作零；额度窗口按实际时长标注，不显示未经确认的每日 Token。首次需手动运行配置，过期后在详情更新。未用真实账号完成端到端验证。

## Codex 宽屏

Codex用量宽屏.js 用于中号组件，复用 Codex用量.js 的钥匙串凭证。左侧按实际时长展示两个额度窗口，右侧显示可用重置次数。先读取 usage 响应的 rate_limit_reset_credits.available_count，缺失时只读请求 /backend-api/wham/rate-limit-reset-credits；缺失或失败显示未提供。不会兑换或消耗重置机会。采用独立的五分钟缓存与浅绿灰波纹背景。
