// Variables used by Scriptable.
// icon-color: dark-gray; icon-glyph: terminal;
// 实验性客户端内部接口；不是公开 REST API。仅查询，不调用模型。
const TOKEN_KEY = 'codex_usage_access_token_v1';
const ACCOUNT_KEY = 'codex_usage_account_id_v1';
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'codex_usage_cache_v1.json');
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
  return { time, plan: typeof raw.plan_type === 'string' ? raw.plan_type : 'Codex', primary, secondary };
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
  const r=w.addStack();txt(r,duration(d,title),10,'#737373');r.addSpacer();txt(r,d?d.remaining.toFixed(0)+'% 剩余':'未提供',11,'#202020',true);
  w.addSpacer(4);if(d){const im=w.addImage(bar(d.remaining));im.imageSize=new Size(125,4);im.resizable=true;}
  w.addSpacer(3);txt(w,reset(d),8,'#888888');
}
function widget(d,error) {
  const w=new ListWidget();w.setPadding(14,14,12,14);w.backgroundColor=new Color('#FAFAFA');w.refreshAfterDate=new Date(Date.now()+300000);
  const h=w.addStack();txt(h,'>_',18,'#202020',true);h.addSpacer(6);txt(h,'Codex',18,'#202020',true);
  w.addSpacer(3);txt(w,d?d.plan.toUpperCase():'CHATGPT PLAN',8,'#888888');w.addSpacer();
  if(d){row(w,d.primary,'主窗口');w.addSpacer(8);row(w,d.secondary,'次窗口');w.addSpacer();
    const df=new DateFormatter();df.dateFormat='MM-dd HH:mm';txt(w,(error?'刷新失败 · ':'更新于 ')+df.string(new Date(d.time)),8,'#888888');
  }else txt(w,Keychain.contains(TOKEN_KEY)?'查询失败，点击查看详情':'请先运行脚本配置凭证',10,'#737373');
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
  const w=widget(d,error);Script.setWidget(w);if(config.runsInApp){await w.presentSmall();await menu(d,error);}Script.complete();
}
await main();
