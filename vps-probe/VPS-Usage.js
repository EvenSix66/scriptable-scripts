// Scriptable iPhone home screen widget. Medium size is recommended.
// Optionally set this to your endpoint to enable the in-app preview.
const defaultURL = ''
// Widget parameter: URL or URL|day, URL|night, URL|auto.
const [rawURL, rawTheme] = String(args.widgetParameter || '').split('|', 2)
const endpoint = rawURL.trim() || defaultURL.trim()
const selectedTheme = ['day', 'night'].includes(rawTheme?.trim()) ? rawTheme.trim() : 'auto'
const cache = FileManager.local()
const cacheKey = encodeURIComponent(endpoint)
const cachePath = cache.joinPath(cache.cacheDirectory(), `vps-history-${cacheKey}.json`)
const previewThemePath = cache.joinPath(cache.documentsDirectory(), 'vps-preview-theme.txt')
const small = config.widgetFamily === 'small'
const metrics = [
  { key: 'cpu', label: 'CPU', day: '#007B88', night: '#68DED8', ink: '#169BA4' },
  { key: 'mem', label: '内存', day: '#7650B0', night: '#BC9BFA', ink: '#9A69D0' },
  { key: 'disk', label: '磁盘', day: '#936317', night: '#F0C779', ink: '#B08032' },
]

function valid(data) {
  return data && Number.isFinite(data.window_seconds) && data.window_seconds > 0 && data.window_seconds <= 86400 &&
    Array.isArray(data.points) && data.points.length > 0 && data.points.length <= 361 && data.points.every(p =>
      p && Number.isFinite(p.t) && p.t >= 0 && p.t < 4102444800 &&
      metrics.every(m => Number.isFinite(p[m.key]) && p[m.key] >= 0 && p[m.key] <= 100))
}

async function loadHistory() {
  try {
    const request = new Request(endpoint)
    request.timeoutInterval = 5
    request.allowInsecureRequest = endpoint.startsWith('http://')
    request.onRedirect = () => null
    const data = await request.loadJSON()
    if (request.response.statusCode !== 200 || !valid(data)) throw new Error('Invalid probe response')
    try { cache.writeString(cachePath, JSON.stringify(data)) } catch (_) {}
    return { data, offline: false }
  } catch (_) {
    try {
      const data = JSON.parse(cache.readString(cachePath))
      if (valid(data)) return { data, offline: true }
    } catch (_) {}
    return { data: null, offline: true }
  }
}

function series(points, seconds, key, left, top, width, height) {
  const end = points.at(-1).t
  const start = end - seconds
  const result = []
  let previous = null
  for (const p of points) {
    if (p.t < start) continue
    result.push({
      x: left + (p.t - start) * width / seconds,
      y: top + height * (1 - p[key] / 100),
      linked: previous !== null && p.t - previous < 150,
    })
    previous = p.t
  }
  return result
}

function widgetChart(points, seconds, width, height) {
  const context = new DrawContext()
  context.size = new Size(width, height)
  context.opaque = false
  context.respectScreenScale = true
  const inset = 3
  const plotWidth = width - 2 * inset
  const plotHeight = height - 2 * inset
  context.setStrokeColor(new Color('#8190AB', 0.34))
  context.setLineWidth(0.5)
  for (const value of [0, 25, 50, 75, 100]) {
    const y = inset + plotHeight * (1 - value / 100)
    const line = new Path()
    line.move(new Point(inset, y))
    line.addLine(new Point(width - inset, y))
    context.addPath(line)
    context.strokePath()
  }
  for (const metric of metrics) {
    const color = new Color(selectedTheme === 'auto' ? metric.ink : metric[selectedTheme])
    context.setStrokeColor(color)
    context.setFillColor(color)
    context.setLineWidth(1.55)
    const line = new Path()
    const vertices = series(points, seconds, metric.key, inset, inset, plotWidth, plotHeight)
    for (const p of vertices) {
      const position = new Point(p.x, p.y)
      if (p.linked) line.addLine(position)
      else line.move(position)
    }
    context.addPath(line)
    context.strokePath()
    const last = vertices.at(-1)
    if (last) context.fillEllipse(new Rect(last.x - 2, last.y - 2, 4, 4))
  }
  return context.getImage()
}

function timeLabel(timestamp) {
  const formatter = new DateFormatter()
  formatter.dateFormat = 'HH:mm'
  return formatter.string(new Date(timestamp * 1000))
}

function widgetColor(day, night) {
  if (selectedTheme === 'day') return new Color(day)
  if (selectedTheme === 'night') return new Color(night)
  return Color.dynamic(new Color(day), new Color(night))
}

function widgetText(parent, value, size, color, bold = false) {
  const text = parent.addText(value)
  text.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size)
  text.textColor = color
  text.lineLimit = 1
  text.minimumScaleFactor = 0.65
  return text
}

function buildWidget(points, seconds, status) {
  const widget = new ListWidget()
  widget.backgroundColor = widgetColor('#F7F8FC', '#101524')
  widget.setPadding(12, 13, 11, 13)
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  const header = widget.addStack()
  header.centerAlignContent()
  widgetText(header, 'VPS 占用率', 14, widgetColor('#172033', '#EEF2FC'), true)
  header.addSpacer()
  widgetText(header, status, 9, widgetColor('#54647B', '#A7B3CC'))
  widget.addSpacer(8)
  const latest = points.at(-1)
  if (!latest) {
    widgetText(widget, endpoint ? '检查探针与分流规则' : '请填写探针 URL', 11, widgetColor('#54647B', '#A7B3CC'))
    return widget
  }

  const values = widget.addStack()
  metrics.forEach((metric, index) => {
    if (index > 0) values.addSpacer(small ? 4 : 13)
    widgetText(values, `${metric.label} ${Math.round(latest[metric.key])}%`, small ? 9 : 11, widgetColor(metric.day, metric.night), true)
  })
  widget.addSpacer(6)
  const width = small ? 110 : 258
  const height = small ? 50 : 56
  const chart = widget.addImage(widgetChart(points, seconds, width, height))
  chart.imageSize = new Size(width, height)
  widget.addSpacer(5)
  widgetText(widget, `近 ${Math.round(seconds / 3600)} 小时 · ${timeLabel(latest.t)}`, 9, widgetColor('#54647B', '#A7B3CC'))
  return widget
}

function previewChart(points, seconds) {
  const grid = [0, 25, 50, 75, 100].map(value => {
    const y = 14 + 145 * (1 - value / 100)
    return `<line x1="36" y1="${y}" x2="345" y2="${y}"/><text x="29" y="${y + 3.5}" text-anchor="end">${value}%</text>`
  }).join('')
  const curves = metrics.map(({ key }) => {
    const vertices = series(points, seconds, key, 36, 14, 309, 145)
    const path = vertices.map(p => `${p.linked ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    const last = vertices.at(-1)
    return `<g class="${key}"><path d="${path}"/><circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3"/></g>`
  }).join('')
  return `<svg viewBox="0 0 357 172" role="img" aria-label="CPU、内存和磁盘占用率曲线"><g class="grid">${grid}</g>${curves}</svg>`
}

function previewHTML(points, seconds, status, theme) {
  const latest = points.at(-1)
  const values = latest ? metrics.map(({ key, label }) => `
    <div class="metric ${key}"><dt><i></i>${label}</dt><dd>${Math.round(latest[key])}<small>%</small></dd></div>`).join('') : ''
  const tone = status === '在线' ? 'live' : status === '缓存' ? 'cached' : 'muted'
  const message = endpoint ? '请检查探针状态与 Surge 分流规则。' : '先在脚本顶部填写 defaultURL，或在主屏幕组件参数中填入探针地址。'
  return `<!doctype html><html lang="zh-CN" data-theme="${theme}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>VPS 占用率</title><style>
:root{color-scheme:light;--bg:#f1f3f9;--panel:#fcfcff;--fg:#172033;--muted:#53617b;--line:#dce2ef;--select:#e5ebf7;--cpu:#007b88;--mem:#7650b0;--disk:#936317}
:root[data-theme="night"]{color-scheme:dark;--bg:#0c101c;--panel:#141a2b;--fg:#eef2fc;--muted:#a7b3cc;--line:#2a354d;--select:#28364d;--cpu:#68ded8;--mem:#bc9bfa;--disk:#f0c779}
@media(prefers-color-scheme:dark){:root[data-theme="auto"]{color-scheme:dark;--bg:#0c101c;--panel:#141a2b;--fg:#eef2fc;--muted:#a7b3cc;--line:#2a354d;--select:#28364d;--cpu:#68ded8;--mem:#bc9bfa;--disk:#f0c779}}
*{box-sizing:border-box}body{margin:0;color:var(--fg);font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);min-height:100vh}
main{max-width:640px;margin:auto;padding:max(28px,env(safe-area-inset-top)) max(17px,env(safe-area-inset-right)) 28px max(17px,env(safe-area-inset-left))}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 21px}
h1{font-size:clamp(22px,6.8vw,29px);letter-spacing:-.06em;line-height:1.15;margin:0;font-weight:700}
.theme{display:flex;align-items:center;gap:1px;padding:3px;background:var(--panel);border:1px solid var(--line);border-radius:11px}
button{font:inherit;font-size:12px;font-weight:600;min-height:34px;border:0;border-radius:7px;padding:3px 8px;background:transparent;color:var(--muted)}
button[aria-pressed=true]{color:var(--fg);background:var(--select)}button:focus-visible{outline:2px solid var(--cpu);outline-offset:1px}
.plot,.empty{background:var(--panel);border:1px solid var(--line);border-radius:17px}.plot{padding:17px 13px 14px}
.plot-head,.plot-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}.plot-head{padding:0 4px}.plot-head h2{font-size:15px;margin:0;line-height:1.2}
.state,.plot-foot,.time{color:var(--muted);font-size:12px}.state{display:inline-flex;align-items:center;gap:5px}.state::before{content:"";display:block;width:6px;height:6px;background:currentColor;border-radius:50%}
.state.live{color:var(--cpu)}.state.cached{color:var(--disk)}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:14px 4px 12px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cpu{--accent:var(--cpu)}.mem{--accent:var(--mem)}.disk{--accent:var(--disk)}
.metric+.metric{border-left:1px solid var(--line);padding-left:clamp(9px,4vw,23px)}.metric dt{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}
.metric i{width:7px;height:7px;background:var(--accent);border-radius:50%}.metric dd{margin:3px 0 0;color:var(--fg);font-size:clamp(23px,7vw,34px);font-weight:650;line-height:1;letter-spacing:-.06em;font-variant-numeric:tabular-nums}
.metric small{font-size:.52em;margin-left:2px;color:var(--muted);font-weight:600}
.plot svg{display:block;width:100%;height:auto;overflow:visible}.grid line{stroke:var(--line);stroke-width:.7}.grid text{fill:var(--muted);font:10px -apple-system,"Segoe UI",sans-serif}
path{fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}circle{fill:var(--accent);stroke:var(--panel);stroke-width:1}
.plot-foot{margin:0 3.3% 0 10%;font-variant-numeric:tabular-nums}.empty{padding:19px;color:var(--muted);line-height:1.55}.empty p{margin:8px 0 0}
</style></head><body><main>
<header><h1>VPS 占用率</h1><nav class="theme" aria-label="显示主题">
<button type="button" data-mode="auto">自动</button><button type="button" data-mode="day">日间</button><button type="button" data-mode="night">夜间</button>
</nav></header>
${latest ? `<section class="plot"><div class="plot-head"><h2>占用趋势</h2><span class="state ${tone}">${status}</span></div><dl class="metrics">${values}</dl>${previewChart(points, seconds)}<div class="plot-foot"><span>近 ${Math.round(seconds / 3600)} 小时</span><span>采样于 ${timeLabel(latest.t)}</span></div></section>` : `<div class="empty"><span class="state ${tone}">${status}</span><p>${message}</p></div>`}
</main><script>
const controls = Array.from(document.querySelectorAll('button[data-mode]'))
const setTheme = mode => {
  document.documentElement.dataset.theme = mode
  controls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)))
}
controls.forEach(button => button.addEventListener('click', () => setTheme(button.dataset.mode)))
setTheme(document.documentElement.dataset.theme)
</script></body></html>`
}

async function showPreview(points, seconds, status) {
  let theme = selectedTheme
  try {
    const saved = cache.readString(previewThemePath)
    if (['auto', 'day', 'night'].includes(saved)) theme = saved
  } catch (_) {}
  const view = new WebView()
  await view.loadHTML(previewHTML(points, seconds, status, theme))
  await view.present()
  try {
    const chosen = await view.evaluateJavaScript('document.documentElement.dataset.theme')
    if (['auto', 'day', 'night'].includes(chosen)) cache.writeString(previewThemePath, chosen)
  } catch (_) {}
}

const { data, offline } = endpoint ? await loadHistory() : { data: null, offline: false }
const points = data ? [...data.points].sort((a, b) => a.t - b.t) : []
const seconds = data?.window_seconds ?? 21600
const latest = points.at(-1)
const stale = latest && (offline || Date.now() / 1000 - latest.t > 180)
const status = latest ? (stale ? '缓存' : '在线') : (endpoint ? '离线' : '未设置')
if (config.runsInWidget) Script.setWidget(buildWidget(points, seconds, status))
else await showPreview(points, seconds, status)
Script.complete()
