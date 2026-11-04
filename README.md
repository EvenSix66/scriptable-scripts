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
