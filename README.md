# DeepSeek 黑金余额小组件

适用于 iPhone Scriptable 的小号方形桌面组件。

## 安装

1. 将 DeepSeek余额.js 导入 Scriptable。
2. 在 App 内运行一次，输入 DeepSeek API Key。
3. 添加 Scriptable 小号桌面组件，Script 选择此脚本，点击动作选择 Run Script。

## 数据与隐私

- 仅请求 https://api.deepseek.com/user/balance，无第三方依赖或统计。
- 密钥保存在 Scriptable Keychain，不包含在源码或余额缓存中。
- 显示可用、充值及赠送余额，不统计每日 Token 或消费。
- 默认缓存五分钟，实际桌面刷新由 iOS 调度。
- 请求失败时显示缓存及离线标记，时间为实际数据获取时间。
- 在 App 中运行可查看详情或更换密钥。

尚未完成 iPhone 真机布局验证。

图标来自 DeepSeek 官方 SVG 的鲸鱼路径，预先转换为金色 PNG 并存于本仓库 assets。手机首次下载后长期本地缓存；不再使用 WebView 转换或手绘回退。失败会在 App 详情中提示。

