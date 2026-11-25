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
  { key: 'cpu', label: 'CPU', day: '#006A75', night: '#5DF9F2' },
  { key: 'mem', label: '内存', day: '#A62168', night: '#FF79C9' },
  { key: 'disk', label: '磁盘', day: '#795000', night: '#FFD671' },
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
  context.setStrokeColor(new Color('#33435A'))
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
    context.setStrokeColor(new Color(metric.night))
    context.setFillColor(new Color(metric.night))
    context.setLineWidth(1.65)
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
  const gradient = new LinearGradient()
  gradient.locations = [0, 1]
  gradient.colors = [widgetColor('#FFFFFF', '#080C17'), widgetColor('#E5F8F5', '#1B1232')]
  gradient.startPoint = new Point(0, 0)
  gradient.endPoint = new Point(1, 1)
  widget.backgroundGradient = gradient
  widget.setPadding(10, 12, 9, 12)
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  const header = widget.addStack()
  header.centerAlignContent()
  widgetText(header, 'VPS 占用率', 14, widgetColor('#111C2C', '#F0F6FF'), true)
  header.addSpacer()
  widgetText(header, status, 9, widgetColor('#006A75', '#5DF9F2'), true)
  widget.addSpacer(6)
  const latest = points.at(-1)
  if (!latest) {
    widgetText(widget, endpoint ? '检查探针与分流规则' : '请填写探针 URL', 11, widgetColor('#43556C', '#A9BCD0'))
    return widget
  }

  const values = widget.addStack()
  for (const metric of metrics) {
    if (metric !== metrics[0]) values.addSpacer()
    const cell = values.addStack()
    cell.layoutVertically()
    widgetText(cell, metric.label, 9, widgetColor('#43556C', '#A9BCD0'))
    widgetText(cell, `${Math.round(latest[metric.key])}%`, small ? 14 : 18, widgetColor(metric.day, metric.night), true)
  }
  widget.addSpacer(3)
  const panel = widget.addStack()
  panel.backgroundColor = new Color('#0B1423')
  panel.cornerRadius = 5
  panel.setPadding(2, 3, 2, 3)
  panel.addSpacer()
  const width = small ? 105 : 246
  const height = small ? 38 : 40
  panel.addImage(widgetChart(points, seconds, width, height)).imageSize = new Size(width, height)
  panel.addSpacer()
  widget.addSpacer(3)
  widgetText(widget, `近 ${Math.round(seconds / 3600)} 小时 · ${timeLabel(latest.t)}`, 9, widgetColor('#43556C', '#A9BCD0'))
  return widget
}

function previewChart(points, seconds) {
  const grid = [0, 25, 50, 75, 100].map(value => {
    const y = 12 + 124 * (1 - value / 100)
    return `<line x1="35" y1="${y}" x2="348" y2="${y}"/><text x="29" y="${y + 3}" text-anchor="end">${value}%</text>`
  }).join('')
  const curves = metrics.map(({ key }) => {
    const vertices = series(points, seconds, key, 35, 12, 313, 124)
    const path = vertices.map(p => `${p.linked ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    const last = vertices.at(-1)
    return `<g class="${key}"><path d="${path}"/><circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3"/></g>`
  }).join('')
  return `<svg viewBox="0 0 360 150" role="img" aria-label="CPU、内存和磁盘占用率曲线"><g class="grid">${grid}</g>${curves}</svg>`
}

function previewHTML(points, seconds, status, theme) {
  const latest = points.at(-1)
  const values = latest ? metrics.map(({ key, label }) => `
    <div class="tile ${key}"><span>${label}</span><strong>${Math.round(latest[key])}<small>%</small></strong></div>`).join('') : ''
  const message = endpoint ? '请检查探针状态与 Surge 分流规则。' : '先在脚本顶部填写 defaultURL，或在主屏幕组件参数中填入探针地址。'
  return `<!doctype html><html lang="zh-CN" data-theme="${theme}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>VPS 占用率</title><style>
:root{color-scheme:light;--bg:#e6f2f2;--panel:#f7fbfb;--fg:#101b2e;--muted:#44596d;--line:#b6ced2;--cpu:#006a75;--mem:#a62168;--disk:#795000;--bloom:#d1eeed}
:root[data-theme="night"]{color-scheme:dark;--bg:#080b16;--panel:#10182a;--fg:#f0f6ff;--muted:#a9bcd0;--line:#33435a;--cpu:#5df9f2;--mem:#ff79c9;--disk:#ffd671;--bloom:#21153b}
@media(prefers-color-scheme:dark){:root[data-theme="auto"]{color-scheme:dark;--bg:#080b16;--panel:#10182a;--fg:#f0f6ff;--muted:#a9bcd0;--line:#33435a;--cpu:#5df9f2;--mem:#ff79c9;--disk:#ffd671;--bloom:#21153b}}
*{box-sizing:border-box}body{margin:0;color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:radial-gradient(ellipse at 95% 0,var(--bloom),transparent 60%),var(--bg);min-height:100vh}
main{max-width:600px;margin:auto;padding:30px max(18px,env(safe-area-inset-right)) 24px max(18px,env(safe-area-inset-left))}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 19px;border-top:2px solid var(--cpu);padding-top:14px}
h1{font-size:25px;letter-spacing:-.045em;margin:0}.theme{display:flex;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:3px}
button{font:inherit;font-size:12px;font-weight:600;min-height:36px;border:0;border-radius:3px;padding:4px 10px;background:transparent;color:var(--muted)}
button[aria-pressed=true]{color:var(--bg);background:var(--fg)}button:focus-visible{outline:2px solid var(--cpu);outline-offset:2px}
.meta{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px;margin:0 0 9px}
.state{color:var(--cpu);font-weight:700}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.cpu{--accent:var(--cpu)}.mem{--accent:var(--mem)}.disk{--accent:var(--disk)}
.tile,.plot,.empty{background:var(--panel);border:1px solid var(--line);border-radius:8px}
.tile{padding:10px 9px 10px;border-top:2px solid var(--accent);overflow:hidden}.tile span{display:block;font-size:11px;color:var(--muted);font-weight:600}
.tile strong{display:block;font:700 clamp(20px,7vw,34px)/1.16 ui-monospace,Menlo,monospace;color:var(--accent);letter-spacing:-.06em}.tile small{font-size:.53em;margin-left:1px}
.plot{padding:12px 8px 8px}.plot svg{display:block;width:100%;height:auto;overflow:visible}.grid line{stroke:var(--line);stroke-width:.65;stroke-dasharray:3 4}
.grid text{fill:var(--muted);font:9px ui-monospace,Menlo,monospace}path{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}circle{fill:var(--accent)}
.axis{display:flex;justify-content:space-between;margin:0 1.5% 0 10%;font:11px ui-monospace,Menlo,monospace;color:var(--muted)}.empty{line-height:1.55;padding:16px;color:var(--muted)}
</style></head><body><main>
<header><h1>VPS 占用率</h1><nav class="theme" aria-label="显示主题">
<button type="button" data-mode="auto">自动</button><button type="button" data-mode="day">日间</button><button type="button" data-mode="night">夜间</button>
</nav></header>
<div class="meta"><span class="state">${status}</span>${latest ? `<span>采样于 ${timeLabel(latest.t)}</span>` : ''}</div>
${latest ? `<div class="cards">${values}</div><section class="plot">${previewChart(points, seconds)}<div class="axis"><span>−${Math.round(seconds / 3600)} 小时</span><span>${timeLabel(latest.t)}</span></div></section>` : `<div class="empty">${message}</div>`}
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
