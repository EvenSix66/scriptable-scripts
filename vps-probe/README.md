# VPS 占用率探针

探针在 Linux 上每分钟记录 CPU（两次采样之间的平均占用率）、内存（总量减可用量）和根文件系统占用率。它保留最近 6 小时的数据，采样文件写入 `/var/lib/vps-probe/history.json`，重启后继续使用原有记录。API 位于 `/v1/history`。

## iPhone 主屏幕

1. 将下方示例中的 `192.0.2.10` 换成服务器 IPv4，将 `PROXY_NAME` 换成 Surge 中指向同一服务器的代理策略名。把规则放在 `[Rule]` 中会匹配该 IP 的通用规则之前。Surge 使用按规则出站模式。

   ```ini
   AND,((IP-CIDR,192.0.2.10/32),(DEST-PORT,18765)),PROXY_NAME
   ```

2. 在 Scriptable 中新建脚本，把 `VPS-Usage.js` 粘贴进去。若要在应用内预览实际曲线，可将脚本顶部的 `defaultURL` 改成自己的探针 URL。直接运行脚本打开预览页，用右上角的「自动／日间／夜间」切换主题。
3. 在 iPhone 主屏幕添加中号 Scriptable 组件，长按并编辑，选择刚创建的脚本。在参数中填入探针 URL，例如 `http://192.0.2.10:18765/v1/history`，并换成自己的服务器 IP。省略主题时跟随 iOS；要固定主题，可在同一参数末尾加 `|day` 或 `|night`。设置了 `defaultURL` 时也可留空。

探针只监听 `127.0.0.1:18765`。服务器本机访问自己的公网 IP 和此端口时，由一条只匹配本机发出连接的规则转发到回环地址，因此 AnyTLS 可以访问探针，外部流量无法直接访问该端口。组件数据暂时取不到时，会显示上一次缓存及其时间。脚本提交的最早刷新时间为 15 分钟后，实际刷新由 iOS 调度。

## 开发和部署

Go 源码只使用标准库。进入本目录后，可用以下 PowerShell 命令交叉编译 Linux x86-64 版本：

```powershell
$env:GOOS='linux'
$env:GOARCH='amd64'
$env:CGO_ENABLED='0'
go build -trimpath -ldflags '-s -w' -o ./vps-probe ./main.go
```

将二进制安装到 `/opt/vps-probe/vps-probe`，两个 systemd 单元放到 `/etc/systemd/system/`。将 `vps-probe-local.nft` 中的 `probe_host` 换成客户端使用的服务器 IPv4，再将文件放到 `/etc/`。使用 `nft -c -f /etc/vps-probe-local.nft` 验证配置，然后执行 `systemctl daemon-reload` 和 `systemctl enable --now vps-probe.socket vps-probe.service`。本机调试时没有 systemd 也可运行二进制，默认监听 `127.0.0.1:18765`，使用 `-state` 指定已有目录内的状态文件。
