import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (id) => document.getElementById(id);
const CONFIG_KEY = 'creative-studio-supabase-config-v1';
let client = null;
let user = null;
let pushTimer = null;
let busy = false;

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
function setMsg(msg, bad=false){ const el=$('cloudAuthMessage'); if(el){el.textContent=msg||'';el.style.color=bad?'#b42318':'';} }
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
function configured(c=readConfig()){ return /^https:\/\/.+\.supabase\.co$/.test(c.url) && c.key.startsWith('sb_publishable_'); }
async function initClient(){
  const c=readConfig();
  if(!configured(c)){ client=null; user=null; setStatus('offline','未設定'); return false; }
  client=createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await client.auth.getSession(); user=data.session?.user||null;
  setStatus(user?'online':'offline',user?'同期ON':'未ログイン',user?.email||'');
  client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;setStatus(user?'online':'offline',user?'同期ON':'未ログイン',user?.email||'');});
  return true;
}
async function pull(){
  if(!client||!user){setMsg('先にログインしてください。',true);return;}
  setStatus('syncing','読み込み中',user.email);
  const {data,error}=await client.from('app_state').select('state').eq('user_id',user.id).maybeSingle();
  if(error){setMsg(`読み込みエラー: ${error.message}`,true);setStatus('online','同期ON',user.email);return;}
  if(data?.state && window.CS_APP){window.CS_APP.replaceState(data.state);setMsg('クラウドのデータを読み込みました。');}
  else setMsg('クラウド側はまだ空です。現在のデータを保存できます。');
  setStatus('online','同期ON',user.email);
}
async function push(){
  if(!client||!user||busy||!window.CS_APP)return;
  busy=true; setStatus('syncing','保存中',user.email);
  const payload={user_id:user.id,state:window.CS_APP.getState(),updated_at:new Date().toISOString()};
  const {error}=await client.from('app_state').upsert(payload,{onConflict:'user_id'});
  busy=false;
  if(error){console.warn(error);setStatus('online','同期エラー',user.email);return;}
  setStatus('online','同期ON',user.email);
}
function schedulePush(){ if(!user)return; clearTimeout(pushTimer); pushTimer=setTimeout(push,800); }
async function login(){
  if(!configured()){setMsg('先にProject URLとPublishable keyを保存してください。',true);return;}
  if(!client) await initClient();
  const email=$('cloudEmail')?.value.trim(); const password=$('cloudPassword')?.value||'';
  if(!email||!password){setMsg('メールとパスワードを入力してください。',true);return;}
  setMsg('ログイン中…');
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error){setMsg(`ログインできません: ${error.message}`,true);return;}
  user=data.user; setMsg('ログインしました。クラウドを確認しています…'); setStatus('online','同期ON',user.email); await pull();
}
async function logout(){ if(client)await client.auth.signOut(); user=null;setStatus('offline','ローカル');setMsg('ログアウトしました。'); }
async function saveConfigFromUI(){
  const cfg=saveConfig($('cloudSupabaseUrl')?.value,$('cloudSupabaseKey')?.value);
  if(!configured(cfg)){setMsg('Project URLまたはPublishable keyの形式を確認してください。',true);return;}
  await initClient(); setMsg('接続情報を保存しました。次にメールとパスワードでログインしてください。');
}

window.CSCloud={schedulePush,push,pull};

window.addEventListener('DOMContentLoaded',async()=>{
  fillConfig(); await initClient();
  $('cloudFab')?.addEventListener('click',()=>{fillConfig();window.CS_APP?.openModal('cloudModal')});
  $('cloudLoginOpenBtn')?.addEventListener('click',()=>{fillConfig();window.CS_APP?.openModal('cloudModal')});
  $('cloudSaveConfigBtn')?.addEventListener('click',saveConfigFromUI);
  $('cloudLoginBtn')?.addEventListener('click',login);
  $('cloudLogoutBtn')?.addEventListener('click',logout);
  $('cloudPullBtn')?.addEventListener('click',pull);
  $('cloudPushBtn')?.addEventListener('click',push);
});
