// Scriptable iPhone home screen widget. Medium size is recommended.
// Optionally set this to your endpoint to enable the in-app preview.
const defaultURL = ''
const endpoint = String(args.widgetParameter || defaultURL).trim()
const cache = FileManager.local()
const cacheKey = encodeURIComponent(endpoint)
const cachePath = cache.joinPath(cache.cacheDirectory(), `vps-history-${cacheKey}.json`)
const small = config.widgetFamily === 'small'
const metrics = [
  { key: 'cpu', label: 'CPU', color: '#22D3EE' },
  { key: 'mem', label: '内存', color: '#A78BFA' },
  { key: 'disk', label: '磁盘', color: '#FBBF24' },
]

function valid(data) {
  return Number.isFinite(data.window_seconds) && data.window_seconds > 0 &&
    Array.isArray(data.points) && data.points.length > 0 && data.points.every(p =>
      Number.isFinite(p.t) && metrics.every(m => Number.isFinite(p[m.key]) && p[m.key] >= 0 && p[m.key] <= 100))
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

function chart(points, seconds, width, height) {
  const context = new DrawContext()
  context.size = new Size(width, height)
  context.opaque = false
  context.respectScreenScale = true
  const inset = 3
  const plotWidth = width - 2 * inset
  const plotHeight = height - 2 * inset
  const end = points[points.length - 1].t
  const start = end - seconds
  context.setStrokeColor(new Color('#334155'))
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
    context.setStrokeColor(new Color(metric.color))
    context.setFillColor(new Color(metric.color))
    context.setLineWidth(1.65)
    const line = new Path()
    let previous = null
    let last = null
    for (const p of points) {
      if (p.t < start) continue
      const x = inset + (p.t - start) * plotWidth / seconds
      const y = inset + plotHeight * (1 - p[metric.key] / 100)
      const position = new Point(x, y)
      if (previous !== null && p.t - previous < 150) line.addLine(position)
      else line.move(position)
      previous = p.t
      last = position
    }
    context.addPath(line)
    context.strokePath()
    if (last) context.fillEllipse(new Rect(last.x - 2, last.y - 2, 4, 4))
  }
  return context.getImage()
}

const widget = new ListWidget()
widget.backgroundColor = new Color('#0F172A')
widget.setPadding(12, 12, 10, 12)
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
const heading = widget.addText('VPS 占用率')
heading.font = Font.semiboldSystemFont(14)
heading.textColor = Color.white()
const { data, offline } = endpoint ? await loadHistory() : { data: null, offline: false }
widget.addSpacer(5)
if (!data) {
  const message = endpoint ? '探针暂不可达\n请检查端点和网络' : '请在组件参数中填入探针 URL'
  const status = widget.addText(message)
  status.font = Font.systemFont(11)
  status.textColor = new Color('#CBD5E1')
} else {
  const points = [...data.points].sort((a, b) => a.t - b.t)
  const latest = points[points.length - 1]
  const row = widget.addStack()
  for (const { key, label, color } of metrics) {
    const item = row.addText(`${label} ${Math.round(latest[key])}%`)
    item.font = Font.semiboldSystemFont(small ? 9 : 11)
    item.textColor = new Color(color)
    item.lineLimit = 1
    item.minimumScaleFactor = 0.7
    if (key !== 'disk') row.addSpacer(small ? 4 : 11)
  }
  widget.addSpacer(4)
  const width = small ? 110 : 264
  const height = small ? 49 : 62
  const image = widget.addImage(chart(points, data.window_seconds, width, height))
  image.imageSize = new Size(width, height)
  widget.addSpacer(3)
  const formatter = new DateFormatter()
  formatter.dateFormat = 'HH:mm'
  const stale = offline || Date.now() / 1000 - latest.t > 180
  const footer = widget.addText(`近 ${Math.round(data.window_seconds / 3600)} 小时 · ${formatter.string(new Date(latest.t * 1000))}${stale ? ' · 缓存' : ''}`)
  footer.font = Font.systemFont(9)
  footer.textColor = new Color('#94A3B8')
}

if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
