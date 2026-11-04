// Variables used by Scriptable.
// icon-color: dark-gray; icon-glyph: terminal;
// 实验性客户端内部接口；不是公开 REST API。仅查询，不调用模型。
const TOKEN_KEY = 'codex_usage_access_token_v1';
const ACCOUNT_KEY = 'codex_usage_account_id_v1';
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'codex_usage_wide_cache_v1.json');
function number(v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
function normalize(raw, time) {
  const rate = raw.rate_limit || (raw.rate_limits && raw.rate_limits.rate_limit);
  if (!rate) throw new Error('接口未返回额度窗口，可能账号不适用或接口已变化');
  function window(w) {
    if (!w) return null;
    const used = number(w.used_percent);
    if (used === null || used < 0 || used > 100) return null;
    const duration = number(w.limit_window_seconds);
    const absolute = number(w.reset_at);
    const after = number(w.reset_after_seconds);
    return { remaining: 100-used, minutes: duration === null ? null : duration/60,
      reset: absolute !== null && absolute > 0 ? absolute*1000 : after !== null && after>=0 ? time+after*1000 : null };
  }
  const primary = window(rate.primary_window), secondary = window(rate.secondary_window);
  if (!primary && !secondary) throw new Error('额度数据不可用，未将缺失字段当作零');
  const resets = number(raw.rate_limit_reset_credits && raw.rate_limit_reset_credits.available_count);
  return { resets: resets !== null && resets >= 0 && Number.isInteger(resets) ? resets : null, time, plan: typeof raw.plan_type === 'string' ? raw.plan_type : 'Codex', primary, secondary };
}
async function configure() {
  const a = new Alert(); a.title='配置 Codex 用量';
  a.message='输入你自己的 Access Token（不是 API Key，也不是 Session Cookie）。Account ID 可选，多工作区时建议填写。凭证仅保存在钥匙串；过期后需手动更新，不自动续期。';
  a.addSecureTextField('Access Token'); a.addTextField('ChatGPT Account ID（可选）',Keychain.contains(ACCOUNT_KEY)?Keychain.get(ACCOUNT_KEY):'');
  a.addAction('保存'); a.addCancelAction('取消');
  if (await a.present() !== 0) return;
  const token=a.textFieldValue(0).trim().replace(/^Bearer\s+/i,'');
  if (!token) return;
  if (/\s|;/.test(token)) throw new Error('请只粘贴 Access Token，不要粘贴 Cookie 或整个 JSON');
  Keychain.set(TOKEN_KEY,token); Keychain.set(ACCOUNT_KEY,a.textFieldValue(1).trim());
  if (fm.fileExists(cachePath)) fm.remove(cachePath);
}
function cache() { try { const d=JSON.parse(fm.readString(cachePath)); return d && Number.isFinite(d.time) ? d : null; } catch(_){return null;} }
async function fetchUsage() {
  const req=new Request('https://chatgpt.com/backend-api/wham/usage'); req.timeoutInterval=20;
  req.headers={Authorization:'Bearer '+Keychain.get(TOKEN_KEY),Accept:'application/json'};
  if (Keychain.contains(ACCOUNT_KEY) && Keychain.get(ACCOUNT_KEY)) req.headers['ChatGPT-Account-ID']=Keychain.get(ACCOUNT_KEY);
  const body=await req.loadString(); const status=req.response?req.response.statusCode:0;
  if (status===401) throw new Error('凭证已失效，请更新 Access Token');
  if (status===403) throw new Error('访问被拒绝或需要网页验证；请在官方网页处理后重试');
  if (status===429) throw new Error('请求过于频繁，请稍后重试');
  if (status!==200) throw new Error('查询失败 HTTP '+status);
  let raw; try {raw=JSON.parse(body);} catch(_){throw new Error('返回非 JSON，可能需要网页登录验证');}
  const d=normalize(raw,Date.now());
  if (d.resets === null) {
    try {
      const extra=new Request('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits');
      extra.timeoutInterval=10; extra.headers=req.headers;
      const info=await extra.loadJSON();
      const count=number(info.available_count);
      if(extra.response && extra.response.statusCode===200 && count!==null && count>=0 && Number.isInteger(count)) d.resets=count;
    } catch(_) {} // 附加信息失败不影响额度显示。
  }
  // 只存最小化额度数据，不缓存响应中的账号标识或凭证。
  try {fm.writeString(cachePath,JSON.stringify(d));} catch(_){}
  return d;
}
function txt(s,value,size,color='#1B1B1B',bold=false) {
  const t=s.addText(value);t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);t.textColor=new Color(color);t.lineLimit=1;t.minimumScaleFactor=0.6;return t;
}
function duration(w,fallback) {
  if (!w || !w.minutes) return fallback;
  const m=w.minutes;
  return m%10080===0 ? m/10080+' 周' : m%1440===0 ? m/1440+' 天' : m%60===0 ? m/60+' 小时' : m+' 分钟';
}
function reset(w) {
  if (!w || !w.reset) return '重置时间未提供';
  if (Date.now()>=w.reset) return '窗口已结束，待刷新';
  const df=new DateFormatter();df.dateFormat='MM-dd HH:mm';return df.string(new Date(w.reset))+' 重置';
}
function bar(p) {
  const c=new DrawContext();c.size=new Size(260,8);c.opaque=false;
  c.setFillColor(new Color('#E4E4E4'));c.fillRect(new Rect(0,0,260,8));
  c.setFillColor(new Color('#202020'));c.fillRect(new Rect(0,0,260*p/100,8));return c.getImage();
}
function row(w,d,title) {
  const r=w.addStack();txt(r,duration(d,title),13,'#737373');r.addSpacer();txt(r,d?d.remaining.toFixed(0)+'% 剩余':'未提供',18,'#202020',true);
  w.addSpacer(4);if(d){const im=w.addImage(bar(d.remaining));im.imageSize=new Size(145,5);im.resizable=true;}
  w.addSpacer(3);txt(w,reset(d),11,'#888888');
}
function wideBackground() {
  const c=new DrawContext();c.size=new Size(1000,480);c.opaque=true;c.respectScreenScale=true;
  c.setFillColor(new Color('#F7F9F8'));c.fillRect(new Rect(0,0,1000,480));
  c.setFillColor(new Color('#D8EEE5',0.65));c.fillEllipse(new Rect(720,-130,430,430));
  c.setFillColor(new Color('#DCE7F0',0.50));c.fillEllipse(new Rect(780,230,380,360));
  for(let i=0;i<6;i++){
    const p=new Path();p.move(new Point(590,500+i*20));
    p.addCurve(new Point(1040,180+i*20),new Point(740,430+i*20),new Point(790,200+i*20));
    c.addPath(p);c.setStrokeColor(new Color('#729E8C',0.13));c.setLineWidth(1.2);c.strokePath();
  }
  return c.getImage();
}
function widget(d,error) {
  const w=new ListWidget();w.setPadding(12,14,10,14);w.backgroundImage=wideBackground();w.refreshAfterDate=new Date(Date.now()+300000);
  const head=w.addStack();head.centerAlignContent();txt(head,'>_ Codex',20,'#202A26',true);head.addSpacer();txt(head,d?d.plan.toUpperCase():'CHATGPT PLAN',11,'#728078');
  w.addSpacer(6);
  if(d){
    const body=w.addStack();body.centerAlignContent();
    const left=body.addStack();left.layoutVertically();
    row(left,d.primary,'主窗口');left.addSpacer(6);row(left,d.secondary,'次窗口');
    body.addSpacer(12);
    const divider=body.addStack();divider.size=new Size(1,78);divider.backgroundColor=new Color('#CAD7D0');
    body.addSpacer(12);
    const right=body.addStack();right.layoutVertically();
    txt(right,'可用重置机会',12,'#64796F');right.addSpacer(2);
    txt(right,d.resets===null?'—':String(d.resets),40,'#244D3C',true);
    right.addSpacer(2);txt(right,d.resets===null?'接口未提供':'次 · 仅显示',11,'#728078');
    w.addSpacer();
    const df=new DateFormatter();df.dateFormat='MM-dd HH:mm';txt(w,(error?'刷新失败 · ':'更新于 ')+df.string(new Date(d.time)),10,'#7B8780');
  }else {w.addSpacer();txt(w,Keychain.contains(TOKEN_KEY)?'查询失败，点击查看详情':'请先运行脚本配置凭证',11,'#737373');w.addSpacer();}
  return w;
}
async function menu(d,error) {
  const a=new Alert();a.title='Codex 用量';a.message=(error?'刷新失败：'+error+'\n\n':'')+(d?'数据时间：'+new Date(d.time).toLocaleString()+'\n额度剩余百分比不是 Token 数量。':'尚无数据。')+'\n\n实验性内部接口，不支持自动续期。';
  a.addAction('更新凭证');a.addDestructiveAction('删除凭证及缓存');a.addCancelAction('完成');
  const v=await a.present();if(v===0)await configure();
  if(v===1){if(Keychain.contains(TOKEN_KEY))Keychain.remove(TOKEN_KEY);if(Keychain.contains(ACCOUNT_KEY))Keychain.remove(ACCOUNT_KEY);if(fm.fileExists(cachePath))fm.remove(cachePath);}
}
async function main(){
  if(!Keychain.contains(TOKEN_KEY)&&config.runsInApp)await configure();
  let d=cache(),error='';
  if(!Keychain.contains(TOKEN_KEY))d=null;
  else if(config.runsInApp||!d||Date.now()-d.time>=300000){try{d=await fetchUsage();}catch(e){error=e.message;}}
  const w=widget(d,error);Script.setWidget(w);if(config.runsInApp){await w.presentMedium();await menu(d,error);}Script.complete();
}
await main();
