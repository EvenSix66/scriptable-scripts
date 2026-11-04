// Variables used by Scriptable.
// icon-color: yellow; icon-glyph: wallet;
// DeepSeek 黑金余额组件。仅请求官方余额接口，无外部依赖。
const KEY = 'deepseek_api_key';
const CACHE_MINUTES = 5;
const fm = FileManager.local();
const cacheFile = fm.joinPath(fm.documentsDirectory(), 'deepseek_gold_balance.json');
const gold = '#E9CC92';
const muted = '#B7AA93';
const logoFile = fm.joinPath(fm.documentsDirectory(), 'deepseek_official_gold_v1.png');
// 只获取官方静态 SVG；不携带余额接口的认证请求头。
async function loadOfficialLogo() {
  if (fm.fileExists(logoFile)) {
    try { return fm.readImage(logoFile); } catch (_) { fm.remove(logoFile); }
  }
  try {
    const req = new Request('https://raw.githubusercontent.com/deepseek-ai/DeepSeek-LLM/main/images/logo.svg');
    req.timeoutInterval = 12;
    const source = await req.loadString();
    if (!req.response || req.response.statusCode !== 200) throw new Error('Logo download failed');
    // 官方组合标识最后一个 path 是鲸鱼。仅提取合法路径数字，不加载 SVG 内的脚本或外部资源。
    const paths = [...source.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)];
    const d = paths.length ? paths[paths.length - 1][1] : '';
    if (!d || d.length > 30000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+eE-]+$/.test(d)) throw new Error('Invalid logo path');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="168" viewBox="0 0 57 42"><path fill="' + gold + '" d="' + d + '"/></svg>';
    const web = new WebView();
    await web.loadHTML('<html><body></body></html>');
    const png = await web.evaluateJavaScript(`
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 224; canvas.height = 168;
        canvas.getContext('2d').drawImage(img, 0, 0, 224, 168);
        completion(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => completion('');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
    `, true);
    if (!png) throw new Error('Logo conversion failed');
    const image = Image.fromData(Data.fromBase64String(png));
    fm.writeImage(logoFile, image);
    return image;
  } catch (_) { return whaleIcon(); }
}

function readCache() {
  try {
    const d = JSON.parse(fm.readString(cacheFile));
    return d && Number.isFinite(d.time) && Array.isArray(d.balances) && d.balances.length ? d : null;
  } catch (_) { return null; }
}
function money(v, currency) {
  const n = Number(v);
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency + ' ';
  return symbol + (Number.isFinite(n) ? n.toFixed(2) : '—');
}
async function configure() {
  const a = new Alert();
  a.title = '设置 DeepSeek API Key';
  a.message = '密钥仅保存到 Scriptable 钥匙串，并随余额请求发送至 api.deepseek.com。取消可保留现有密钥。';
  a.addSecureTextField('粘贴 API Key');
  a.addAction('保存');
  a.addCancelAction('取消');
  if (await a.present() !== 0) return;
  const key = a.textFieldValue(0).trim();
  if (key) {
    Keychain.set(KEY, key);
    if (fm.fileExists(cacheFile)) fm.remove(cacheFile);
  }
}
async function fetchBalance() {
  const req = new Request('https://api.deepseek.com/user/balance');
  req.method = 'GET';
  req.timeoutInterval = 20;
  req.headers = { Authorization: 'Bearer ' + Keychain.get(KEY), Accept: 'application/json' };
  const data = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status !== 200) {
    if (status === 401) throw new Error('密钥无效，请重新设置');
    if (status === 429) throw new Error('请求频繁，请稍后再试');
    throw new Error('查询失败（HTTP ' + status + '）');
  }
  if (!Array.isArray(data.balance_infos) || !data.balance_infos.length) throw new Error('接口未返回余额');
  const balances = data.balance_infos.map(b => {
    const values = [b.total_balance, b.topped_up_balance, b.granted_balance];
    if (values.some(v => v == null || !Number.isFinite(Number(v)))) throw new Error('余额数据格式异常');
    return { currency: String(b.currency || 'CNY'), total: Number(b.total_balance), topup: Number(b.topped_up_balance), grant: Number(b.granted_balance) };
  });
  const result = { time: Date.now(), available: !!data.is_available, balances };
  try { fm.writeString(cacheFile, JSON.stringify(result)); } catch (_) {}
  return result;
}
function text(stack, value, size, color, bold = false) {
  const t = stack.addText(value);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}
// 全部在设备本地绘图，不下载图片或执行远程代码。
function whaleIcon() {
  const c = new DrawContext();
  c.size = new Size(100, 72); c.opaque = false; c.respectScreenScale = true;
  const p = new Path();
  p.move(new Point(8, 42));
  p.addCurve(new Point(64, 16), new Point(4, 7), new Point(43, 4));
  p.addCurve(new Point(78, 27), new Point(70, 22), new Point(74, 26));
  p.addCurve(new Point(98, 4), new Point(91, 26), new Point(96, 13));
  p.addCurve(new Point(83, 14), new Point(88, 9), new Point(85, 10));
  p.addCurve(new Point(70, 8), new Point(79, 8), new Point(74, 8));
  p.addCurve(new Point(79, 34), new Point(71, 20), new Point(74, 30));
  p.addCurve(new Point(29, 65), new Point(74, 64), new Point(49, 76));
  p.addCurve(new Point(8, 42), new Point(15, 63), new Point(9, 53));
  p.closeSubpath(); c.addPath(p); c.setFillColor(new Color(gold)); c.fillPath();
  const mouth = new Path(); mouth.move(new Point(13, 47));
  mouth.addCurve(new Point(48, 58), new Point(22, 35), new Point(36, 43));
  mouth.addCurve(new Point(13, 47), new Point(34, 68), new Point(18, 60));
  mouth.closeSubpath(); c.addPath(mouth); c.setFillColor(new Color('#252523')); c.fillPath();
  c.setFillColor(new Color('#252523')); c.fillEllipse(new Rect(24, 29, 4, 4));
  return c.getImage();
}
function goldBackground() {
  const c = new DrawContext();
  c.size = new Size(480, 480); c.opaque = true; c.respectScreenScale = true;
  // 深炭色底，上部较亮，底部收暗。
  for (let y = 0; y < 480; y++) {
    const v = Math.round(39 - y / 480 * 19).toString(16).padStart(2, '0');
    c.setFillColor(new Color('#' + v + v + v)); c.fillRect(new Rect(0, y, 480, 1));
  }
  function wave(offset, width, alpha) {
    const p = new Path(); p.move(new Point(-30, 520 + offset));
    p.addCurve(new Point(510, 345 + offset), new Point(170, 510 + offset), new Point(250, 370 + offset));
    c.addPath(p); c.setStrokeColor(new Color('#E8BE73', alpha)); c.setLineWidth(width); c.strokePath();
  }
  // 多层半透明描边形成柔光，再用细线描出波浪边缘。
  for (let i = 18; i > 0; i--) wave(0, i * 5, 0.012);
  wave(0, 1.8, 0.95);
  wave(19, 0.8, 0.40);
  wave(39, 0.7, 0.20);
  wave(-15, 0.6, 0.16);
  return c.getImage();
}
function buildWidget(data, error, logo) {
  const w = new ListWidget();
  w.setPadding(15, 15, 13, 15);
  w.backgroundImage = goldBackground();
  w.refreshAfterDate = new Date(Date.now() + CACHE_MINUTES * 60000);
  const header = w.addStack();
  header.centerAlignContent();
  const im = header.addImage(logo);
  im.imageSize = new Size(27, 20);
  header.addSpacer(6);
  text(header, 'DeepSeek', 16, gold, true);
  w.addSpacer(9);
  text(w, '可用余额', 10, muted);
  w.addSpacer(2);
  const b = data ? data.balances.find(x => x.currency === 'CNY') || data.balances[0] : null;
  text(w, b ? money(b.total, b.currency) : '—', 34, gold, true);
  w.addSpacer();
  if (b) {
    const row = w.addStack();
    const left = row.addStack(); left.layoutVertically();
    text(left, '充值', 9, muted);
    left.addSpacer(2);
    text(left, money(b.topup, b.currency), 13, '#F0E7D5', true);
    row.addSpacer();
    const right = row.addStack(); right.layoutVertically();
    text(right, '赠送', 9, muted);
    right.addSpacer(2);
    text(right, money(b.grant, b.currency), 13, '#F0E7D5', true);
    w.addSpacer(9);
    const df = new DateFormatter(); df.dateFormat = 'MM-dd HH:mm';
    const label = error ? '离线 · ' : data.available ? '更新于 ' : '账户不可用 · ';
    text(w, label + df.string(new Date(data.time)), 8, error ? '#E7AF79' : muted);
  } else {
    text(w, Keychain.contains(KEY) ? '查询失败，点击重试' : '请先打开脚本设置密钥', 10, muted);
  }
  return w;
}
async function showDetails(data, error) {
  const a = new Alert();
  a.title = 'DeepSeek 账户余额';
  a.message = data ? data.balances.map(b => `${b.currency}\n可用：${money(b.total,b.currency)}\n充值：${money(b.topup,b.currency)}\n赠送：${money(b.grant,b.currency)}`).join('\n\n') + '\n\n数据时间：' + new Date(data.time).toLocaleString() + (error ? '\n刷新失败，以上为缓存数据。' : '') : '暂时无法查询余额，请检查网络或密钥。';
  a.addAction('更换 API Key');
  a.addCancelAction('完成');
  if (await a.present() === 0) await configure();
}
async function main() {
  if (!Keychain.contains(KEY) && config.runsInApp) await configure();
  let data = readCache();
  let error = false;
  if (Keychain.contains(KEY)) {
    if (config.runsInApp || !data || Date.now() - data.time >= CACHE_MINUTES * 60000) {
      try { data = await fetchBalance(); } catch (_) { error = true; }
    }
  } else { data = null; }
  const logo = await loadOfficialLogo();
  const w = buildWidget(data, error, logo);
  Script.setWidget(w);
  if (config.runsInApp) {
    await w.presentSmall();
    await showDetails(data, error);
  }
  Script.complete();
}
await main();
