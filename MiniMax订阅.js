// Variables used by Scriptable.
// icon-color: deep-orange; icon-glyph: chart-pie;
// MiniMax 国内订阅小组件。密钥只发往 www.minimax.cn。
const KEY = 'minimax_cn_subscription_key';
const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), 'minimax_cn_quota_v1.json');
const accent = '#F65B3D';
function numeric(v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
function percent(entry, field) {
  const n = numeric(entry[field]);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}
function normalize(payload, now) {
  const root = payload.data && Array.isArray(payload.data.model_remains) ? payload.data : payload;
  if (!Array.isArray(root.model_remains)) throw new Error('未识别接口结构，请在详情查看响应');
  const entries = root.model_remains;
  const e = entries.find(x => /^general$/i.test(x.model_name || '')) || entries.find(x => /^MiniMax-M/i.test(x.model_name || '')) || entries.find(x => /^(chat|text)$/i.test(x.model_name || ''));
  if (!e) throw new Error('接口未返回文本模型额度');
  const five = percent(e, 'current_interval_remaining_percent');
  const week = percent(e, 'current_weekly_remaining_percent');
  // 不用含义容易混淆的 usage_count 推算百分比，也不把额度当作原始 Token。
  const end = v => { const n = numeric(v); return n !== null && n > 0 ? now + n : null; };
  return { time: now, model: String(e.model_name), five, week,
    fiveEnd: end(e.remains_time), weekEnd: end(e.weekly_remains_time),
    fiveStatus: numeric(e.current_interval_status), weekStatus: numeric(e.current_weekly_status) };
}
async function configure() {
  const a = new Alert(); a.title = 'MiniMax 国内订阅 Key';
  a.message = '填写 minimax.cn 的订阅 Key，密钥保存在钥匙串。';
  a.addSecureTextField('订阅 Key'); a.addAction('保存'); a.addCancelAction('取消');
  if (await a.present() === 0) {
    const key = a.textFieldValue(0).trim();
    if (key) { Keychain.set(KEY, key); if (fm.fileExists(file)) fm.remove(file); }
  }
}
function readCache() {
  try { const d = JSON.parse(fm.readString(file)); return d && Number.isFinite(d.time) ? d : null; } catch (_) { return null; }
}
let lastPayload = null;
async function fetchQuota() {
  const req = new Request('https://www.minimax.cn/v1/token_plan/remains');
  req.timeoutInterval = 20;
  req.headers = { Authorization: 'Bearer ' + Keychain.get(KEY), Accept: 'application/json' };
  const payload = await req.loadJSON();
  if (!req.response || req.response.statusCode !== 200) throw new Error('HTTP ' + (req.response ? req.response.statusCode : '未知'));
  const resp = payload.base_resp || (payload.data && payload.data.base_resp);
  if (resp && numeric(resp.status_code) !== 0) throw new Error('查询失败，接口状态码 ' + resp.status_code);
  lastPayload = payload;
  const d = normalize(payload, Date.now());
  try { fm.writeString(file, JSON.stringify(d)); } catch (_) {}
  return d;
}
function label(s, value, size, color, bold=false) {
  const t = s.addText(value); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color); t.lineLimit = 1; t.minimumScaleFactor = 0.65; return t;
}
function background() {
  const c = new DrawContext(); c.size = new Size(480,480); c.opaque = true; c.respectScreenScale = true;
  c.setFillColor(new Color('#FFF9F5')); c.fillRect(new Rect(0,0,480,480));
  c.setFillColor(new Color('#FF7857',0.08)); c.fillEllipse(new Rect(240,300,400,300));
  return c.getImage();
}
function bar(p) {
  const c = new DrawContext(); c.size = new Size(260,8); c.opaque = false;
  c.setFillColor(new Color('#F0DED6')); c.fillRect(new Rect(0,0,260,8));
  if (p !== null) { c.setFillColor(new Color(accent)); c.fillRect(new Rect(0,0,260*p/100,8)); }
  return c.getImage();
}
function resetText(end) {
  if (!end) return '重置时间未提供';
  if (Date.now() >= end) return '窗口已结束，待刷新';
  const df = new DateFormatter(); df.dateFormat = 'MM-dd HH:mm';
  return df.string(new Date(end)) + ' 重置';
}
function windowRow(w, title, p, end, status) {
  const row = w.addStack();
  label(row,title,10,'#8D6E63'); row.addSpacer();
  label(row,p === null ? '未提供' : p.toFixed(0)+'% 剩余',11,accent,true);
  w.addSpacer(4);
  const im = w.addImage(bar(p)); im.imageSize = new Size(125,4); im.resizable = true;
  w.addSpacer(3);
  label(w, status === 3 ? '窗口未激活／不适用' : resetText(end),8,'#A38C82');
}
function widget(d, error) {
  const w = new ListWidget(); w.setPadding(14,14,12,14); w.backgroundImage = background();
  w.refreshAfterDate = new Date(Date.now()+300000);
  const h = w.addStack(); h.centerAlignContent();
  label(h,'MiniMax',19,accent,true); h.addSpacer(); label(h,'CN',8,'#A38C82');
  w.addSpacer(3); label(w,'TOKEN PLAN',8,'#A38C82'); w.addSpacer();
  if (d) {
    windowRow(w,'5 小时',d.five,d.fiveEnd,d.fiveStatus); w.addSpacer(8);
    windowRow(w,'每周',d.week,d.weekEnd,d.weekStatus); w.addSpacer();
    const df = new DateFormatter(); df.dateFormat='MM-dd HH:mm';
    label(w,(error ? '离线 · ' : '更新于 ')+df.string(new Date(d.time)),8,'#A38C82');
  } else label(w,Keychain.contains(KEY) ? '查询失败，点击查看详情' : '请先运行脚本设置订阅 Key',10,'#8D6E63');
  return w;
}
async function details(d,error) {
  const a = new Alert(); a.title = 'MiniMax 国内订阅';
  a.message = (error ? '刷新失败：'+error+'\n\n' : '') + (d ? '模型：'+d.model+'\n5 小时剩余：'+(d.five === null ? '未提供' : d.five+'%')+'\n每周剩余：'+(d.week === null ? '未提供' : d.week+'%')+'\n数据时间：'+new Date(d.time).toLocaleString() : '暂无数据');
  a.addAction('更换订阅 Key');
  if (lastPayload) a.addAction('查看接口响应');
  a.addCancelAction('完成');
  const choice = await a.present();
  if (choice === 0) await configure();
  if (choice === 1 && lastPayload) { const v = new Alert(); v.title='接口响应（不含请求头密钥）'; v.message=JSON.stringify(lastPayload,null,2); v.addAction('好'); await v.present(); }
}
async function main() {
  if (!Keychain.contains(KEY) && config.runsInApp) await configure();
  let d=readCache(), error='';
  if (!Keychain.contains(KEY)) d=null;
  else if (config.runsInApp || !d || Date.now()-d.time>=300000) {
    try { d=await fetchQuota(); } catch(e) { error=e.message; }
  }
  const w=widget(d,error); Script.setWidget(w);
  if (config.runsInApp) { await w.presentSmall(); await details(d,error); }
  Script.complete();
}
await main();
