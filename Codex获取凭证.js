// Variables used by Scriptable.
// icon-color: dark-gray; icon-glyph: key;
// 手动运行：在官方页面登录，关闭页面后读取同一 WebView 的会话。
// 不索取密码，不把 Token 放进 URL、日志、剪贴板或本地文件。
const TOKEN_KEY='codex_usage_access_token_v1';
const ACCOUNT_KEY='codex_usage_account_id_v1';
async function notice(title,message){const a=new Alert();a.title=title;a.message=message;a.addAction('好');await a.present();}
function expiration(token){
  try{let b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');b+='='.repeat((4-b.length%4)%4);const e=JSON.parse(Data.fromBase64String(b).toRawString()).exp;return typeof e==='number'&&Number.isFinite(e)&&e>0?e*1000:null;}catch(_){return null;}
}
async function save(token,account){
  token=token.trim().replace(/^Bearer\s+/i,'');
  if(!token||/\s|;/.test(token))throw new Error('请提供 Access Token，不是 Cookie 或整个 JSON');
  const exp=expiration(token);if(exp && exp<=Date.now())throw new Error('此 Token 已到期，请重新登录获取');
  const confirm=new Alert();confirm.title='保存到本机钥匙串';
  confirm.message=(exp?'Token 声明到期时间：'+new Date(exp).toLocaleString():'无法读取 Token 到期时间')+'\n将替换 Codex 小号与宽屏组件共用的凭证。';
  confirm.addAction('保存');confirm.addCancelAction('取消');if(await confirm.present()!==0)return;
  Keychain.set(TOKEN_KEY,token);
  // 新会话默认使用个人工作区，清除旧账号选择，避免串用。
  Keychain.set(ACCOUNT_KEY,account||'');
  const fm=FileManager.local();for(const name of ['codex_usage_cache_v1.json','codex_usage_wide_cache_v1.json']){const p=fm.joinPath(fm.documentsDirectory(),name);if(fm.fileExists(p))fm.remove(p);}
  await notice('保存成功','请运行「Codex用量宽屏」刷新。多工作区用户可在组件设置中补填 Account ID。');
}
async function manual(){
  const a=new Alert();a.title='手动导入';a.message='可粘贴 Access Token 或你在官方 /api/auth/session 页面获得的 JSON。Session Cookie 不支持。';
  a.addSecureTextField('Access Token 或会话 JSON');a.addTextField('Account ID（可选）');a.addAction('继续');a.addCancelAction('取消');
  if(await a.present()!==0)return;
  let token=a.textFieldValue(0).trim();if(token.startsWith('{')){const data=JSON.parse(token);token=data.accessToken||'';}
  await save(token,a.textFieldValue(1).trim());
}
async function browserLogin(){
  await notice('官方网页登录','接下来在 ChatGPT 官方页面自行登录并完成验证。确认进入 ChatGPT 后，点击完成关闭页面。脚本随后读取该 WebView 的会话；不保证与 Safari 共用登录。');
  const web=new WebView();await web.loadURL('https://chatgpt.com/');await web.present(true);
  const result=await web.evaluateJavaScript(`(async()=>{
    try{
      if(location.origin!=='https://chatgpt.com'){completion({error:'请完成官方登录，确认已回到 chatgpt.com 后再关闭页面'});return;}
      const r=await fetch('/api/auth/session',{credentials:'same-origin'});
      if(!r.ok){completion({error:'会话读取失败 HTTP '+r.status});return;}
      const s=await r.json();completion(s.accessToken?{token:s.accessToken}:{error:'会话中没有 Access Token'});
    }catch(_){completion({error:'无法读取会话，可能需要手动导入'});}
  })()`,true);
  if(!result||!result.token)throw new Error(result&&result.error||'无法读取会话');
  await save(result.token,'');
}
async function main(){
  if(!config.runsInApp)throw new Error('请在 Scriptable App 内手动运行');
  const a=new Alert();a.title='Codex 凭证助手';a.message='通过官方网页登录获取当前会话 Token，或手动导入。不会保证签发新的 Token，也不自动续期。';
  a.addAction('官方网页登录获取');a.addAction('手动导入');a.addCancelAction('取消');const choice=await a.present();
  try{if(choice===0)await browserLogin();if(choice===1)await manual();}catch(_){await notice('获取失败','WebView 登录、会话读取或凭证校验未成功。可重新运行选择手动导入，从 Safari 登录 chatgpt.com 后打开 https://chatgpt.com/api/auth/session 获取。请勿分享凭证。');}
  Script.complete();
}
await main();
