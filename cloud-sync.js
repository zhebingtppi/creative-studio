import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (id) => document.getElementById(id);
const CONFIG_KEY = 'creative-studio-supabase-config-v1';
const REMOTE_STAMP_KEY = 'creative-studio-last-remote-updated-v1';
const BACKUP_KEY = 'creative-studio-auto-backups-v1';
const MAX_BACKUPS = 8;
let client = null;
let user = null;
let pushTimer = null;
let retryTimer = null;
let busy = false;
let dirty = false;
let pushAgain = false;
let syncTimer = null;
let conflict = false;
let lastRemoteUpdated = localStorage.getItem(REMOTE_STAMP_KEY) || '';

function readConfig(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch {}
  const base = window.CREATIVE_STUDIO_CONFIG || {};
  return {
    url: (saved.url || base.supabaseUrl || '').replace(/\/$/, ''),
    key: saved.key || base.supabaseAnonKey || ''
  };
}
function saveConfig(url,key){
  const cfg={url:(url||'').trim().replace(/\/$/,''),key:(key||'').trim()};
  localStorage.setItem(CONFIG_KEY,JSON.stringify(cfg));
  return cfg;
}
function setMsg(msg, bad=false){
  const el=$('cloudAuthMessage');
  if(el){el.textContent=msg||'';el.style.color=bad?'#b42318':'';}
}
function setStatus(mode,label,email=''){
  const fab=$('cloudFab'), lab=$('cloudFabLabel'), st=$('cloudSettingsStatus'), logout=$('cloudLogoutBtn');
  if(fab){fab.classList.remove('online','offline','syncing');fab.classList.add(mode||'offline')}
  if(lab)lab.textContent=label||'ローカル';
  if(st)st.textContent=email?`${label} · ${email}`:label;
  if(logout)logout.classList.toggle('hidden',!user);
}
function fillConfig(){
  const c=readConfig();
  if($('cloudSupabaseUrl')) $('cloudSupabaseUrl').value=c.url;
  if($('cloudSupabaseKey')) $('cloudSupabaseKey').value=c.key;
}
function configured(c=readConfig()){
  return /^https:\/\/.+\.supabase\.co$/.test(c.url) && c.key.startsWith('sb_publishable_');
}
function rememberRemoteStamp(stamp){
  if(!stamp)return;
  lastRemoteUpdated=stamp;
  localStorage.setItem(REMOTE_STAMP_KEY,stamp);
}
function backupNow(reason='auto'){
  if(!window.CS_APP)return;
  try{
    const arr=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]');
    arr.unshift({at:new Date().toISOString(),reason,state:window.CS_APP.getState()});
    localStorage.setItem(BACKUP_KEY,JSON.stringify(arr.slice(0,MAX_BACKUPS)));
    const el=$('backupStatus');
    if(el)el.textContent=`端末バックアップ: ${new Date().toLocaleString('ja-JP')}`;
  }catch(e){console.warn('backup failed',e)}
}
function startBackgroundSync(){
  clearInterval(syncTimer);
  syncTimer=setInterval(async()=>{
    if(!user || document.visibilityState!=='visible' || !navigator.onLine) return;
    if(dirty) await push();
    else await pull({silent:true,onlyIfNewer:true});
  },30000);
}
async function initClient(){
  const c=readConfig();
  if(!configured(c)){ client=null; user=null; setStatus('offline','未設定'); return false; }
  client=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await client.auth.getSession();
  user=data.session?.user||null;
  setStatus(user?'online':'offline',user?'同期ON':'未ログイン',user?.email||'');
  if(user) startBackgroundSync();
  client.auth.onAuthStateChange((_event,session)=>{
    user=session?.user||null;
    setStatus(user?'online':'offline',user?'同期ON':'未ログイン',user?.email||'');
    if(user) startBackgroundSync(); else clearInterval(syncTimer);
  });
  return true;
}
async function fetchRemote(){
  return client.from('app_state').select('state,updated_at').eq('user_id',user.id).maybeSingle();
}
async function pull({silent=false,onlyIfNewer=false,seedIfEmpty=false}={}){
  if(!client||!user){if(!silent)setMsg('先にログインしてください。',true);return false;}
  if(!navigator.onLine){setStatus('offline','オフライン',user.email);return false;}
  if(dirty && onlyIfNewer) return false;
  if(!silent)setStatus('syncing','読み込み中',user.email);
  const {data,error}=await fetchRemote();
  if(error){
    if(!silent)setMsg(`読み込みエラー: ${error.message}`,true);
    setStatus('online','同期エラー',user.email);
    return false;
  }
  if(data?.state && window.CS_APP){
    if(onlyIfNewer && data.updated_at && lastRemoteUpdated && data.updated_at<=lastRemoteUpdated){
      setStatus('online','同期ON',user.email);
      return true;
    }
    if(dirty) backupNow('before-cloud-pull');
    window.CS_APP.replaceState(data.state);
    dirty=false; conflict=false;
    rememberRemoteStamp(data.updated_at);
    if(!silent)setMsg('クラウドの最新データを読み込みました。');
  } else if(seedIfEmpty){
    if(!silent)setMsg('クラウドが空なので、この端末のデータを初期保存します。');
    return push({force:true});
  } else if(!silent) setMsg('クラウド側はまだ空です。現在のデータを保存できます。');
  setStatus('online','同期ON',user.email);
  return true;
}
async function push({force=false}={}){
  if(!client||!user||!window.CS_APP)return false;
  if(!navigator.onLine){dirty=true;setStatus('offline','未同期',user.email);return false;}
  if(busy){pushAgain=true;return false;}
  busy=true;
  clearTimeout(pushTimer);clearTimeout(retryTimer);
  setStatus('syncing','保存中',user.email);

  if(!force && lastRemoteUpdated){
    const {data:remote,error:checkError}=await fetchRemote();
    if(!checkError && remote?.updated_at && remote.updated_at>lastRemoteUpdated){
      backupNow('sync-conflict-local');
      conflict=true; busy=false; dirty=true;
      setStatus('offline','競合あり',user.email);
      setMsg('別の端末で新しい更新があります。自動上書きを止めました。「クラウドから読み込む」か「今すぐ保存」を選んでください。',true);
      return false;
    }
  }

  const stamp=new Date().toISOString();
  const payload={user_id:user.id,state:window.CS_APP.getState(),updated_at:stamp};
  const {data,error}=await client.from('app_state').upsert(payload,{onConflict:'user_id'}).select('updated_at').maybeSingle();
  busy=false;
  if(error){
    console.warn(error);
    dirty=true;
    setStatus(navigator.onLine?'online':'offline','同期エラー',user.email);
    retryTimer=setTimeout(()=>{ if(user&&dirty&&navigator.onLine) push(); },5000);
    return false;
  }
  dirty=false; conflict=false;
  rememberRemoteStamp(data?.updated_at || stamp);
  setStatus('online','保存済',user.email);
  if(pushAgain){pushAgain=false;return push();}
  return true;
}
function schedulePush(){
  dirty=true;
  if(!user){setStatus('offline','ローカル保存');return;}
  clearTimeout(pushTimer);
  setStatus(navigator.onLine?'syncing':'offline',navigator.onLine?'変更あり':'未同期',user.email);
  pushTimer=setTimeout(()=>push(),600);
}
async function login(){
  if(!configured()){setMsg('先にProject URLとPublishable keyを保存してください。',true);return;}
  if(!client) await initClient();
  const email=$('cloudEmail')?.value.trim();
  const password=$('cloudPassword')?.value||'';
  if(!email||!password){setMsg('メールとパスワードを入力してください。',true);return;}
  setMsg('ログイン中…');
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error){setMsg(`ログインできません: ${error.message}`,true);return;}
  user=data.user;
  setMsg('ログインしました。クラウドを確認しています…');
  setStatus('online','同期ON',user.email);
  startBackgroundSync();
  await pull({seedIfEmpty:true});
}
async function logout(){
  clearInterval(syncTimer);clearTimeout(retryTimer);
  if(client)await client.auth.signOut();
  user=null;
  setStatus('offline','ローカル');
  setMsg('ログアウトしました。');
}
async function saveConfigFromUI(){
  const cfg=saveConfig($('cloudSupabaseUrl')?.value,$('cloudSupabaseKey')?.value);
  if(!configured(cfg)){setMsg('Project URLまたはPublishable keyの形式を確認してください。',true);return;}
  await initClient();
  setMsg('接続情報を保存しました。次にメールとパスワードでログインしてください。');
}

window.CSCloud={schedulePush,push,pull,backupNow,isDirty:()=>dirty,hasConflict:()=>conflict};

window.addEventListener('online',async()=>{
  if(!user)return;
  setStatus('syncing',dirty?'再接続・保存中':'再接続中',user.email);
  if(dirty) await push();
  else await pull({silent:true,onlyIfNewer:true});
});
window.addEventListener('offline',()=>{ if(user)setStatus('offline',dirty?'未同期':'オフライン',user.email); });
document.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState!=='visible'||!user||!navigator.onLine)return;
  if(dirty) await push();
  else await pull({silent:true,onlyIfNewer:true});
});
window.addEventListener('focus',async()=>{
  if(!user||!navigator.onLine||document.visibilityState!=='visible')return;
  if(dirty) await push();
  else await pull({silent:true,onlyIfNewer:true});
});

window.addEventListener('DOMContentLoaded',async()=>{
  fillConfig();
  await initClient();
  const backups=(()=>{try{return JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]')}catch{return[]}})();
  if(backups[0]&&$('backupStatus')) $('backupStatus').textContent=`端末バックアップ: ${new Date(backups[0].at).toLocaleString('ja-JP')}`;
  $('cloudFab')?.addEventListener('click',()=>{fillConfig();window.CS_APP?.openModal('cloudModal')});
  $('cloudLoginOpenBtn')?.addEventListener('click',()=>{fillConfig();window.CS_APP?.openModal('cloudModal')});
  $('cloudSaveConfigBtn')?.addEventListener('click',saveConfigFromUI);
  $('cloudLoginBtn')?.addEventListener('click',login);
  $('cloudLogoutBtn')?.addEventListener('click',logout);
  $('cloudPullBtn')?.addEventListener('click',()=>pull());
  $('cloudPushBtn')?.addEventListener('click',()=>push({force:true}));
});
