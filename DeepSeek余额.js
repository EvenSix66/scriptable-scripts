// Variables used by Scriptable.
// icon-color: yellow; icon-glyph: wallet;
// DeepSeek 蓝白余额组件。仅请求官方余额接口，无外部依赖。
const KEY = 'deepseek_api_key';
const CACHE_MINUTES = 5;
const fm = FileManager.local();
const cacheFile = fm.joinPath(fm.documentsDirectory(), 'deepseek_gold_balance.json');
const gold = '#4D6BFE';
const muted = '#79849C';
const logoFile = fm.joinPath(fm.documentsDirectory(), 'deepseek_official_blue_v1.png');
let logoError = '';
async function loadOfficialLogo() {
  if (fm.fileExists(logoFile)) {
    try { return fm.readImage(logoFile); } catch (_) { fm.remove(logoFile); }
  }
  try {
    const req = new Request('https://raw.githubusercontent.com/EvenSix66/scriptable-scripts/main/assets/deepseek-blue.png');
    req.timeoutInterval = 20;
    const image = await req.loadImage();
    if (!req.response || req.response.statusCode !== 200) throw new Error('HTTP error');
    fm.writeImage(logoFile, image);
    return image;
  } catch (_) {
    logoError = '官方图标下载失败，请检查 GitHub 网络';
    return null;
  }
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
function goldBackground() {
  const c = new DrawContext(); c.size = new Size(480, 480);
  c.opaque = true; c.respectScreenScale = true;
  c.setFillColor(new Color('#F8FAFF')); c.fillRect(new Rect(0,0,480,480));
  c.setFillColor(new Color('#4D6BFE', 0.05)); c.fillEllipse(new Rect(220,290,420,300));
  const p = new Path(); p.move(new Point(-30,490));
  p.addCurve(new Point(510,365),new Point(190,480),new Point(270,380));
  c.addPath(p); c.setStrokeColor(new Color('#4D6BFE',0.18)); c.setLineWidth(1.5); c.strokePath();
  return c.getImage();
}
function buildWidget(data, error, logo) {
  const w = new ListWidget();
  w.setPadding(15, 15, 13, 15);
  w.backgroundImage = goldBackground();
  w.refreshAfterDate = new Date(Date.now() + CACHE_MINUTES * 60000);
  const header = w.addStack();
  header.centerAlignContent();
  if (logo) {
    const im = header.addImage(logo);
    im.imageSize = new Size(27, 20);
    header.addSpacer(6);
  }
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
    text(left, money(b.topup, b.currency), 13, '#283B70', true);
    row.addSpacer();
    const right = row.addStack(); right.layoutVertically();
    text(right, '赠送', 9, muted);
    right.addSpacer(2);
    text(right, money(b.grant, b.currency), 13, '#283B70', true);
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
  if (logoError) a.message += '\n\n' + logoError;
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
