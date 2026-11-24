const $ = (s) => document.querySelector(s);
function storageGet(key, fallback='') { try { const value=localStorage.getItem(key); return value===null?fallback:value; } catch (_) { return fallback; } }
function storageSet(key,value) { try { localStorage.setItem(key,value); return true; } catch (_) { return false; } }
function makeId() { if(window.crypto&&typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID(); return 'tab-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
let savedBookmarks=[]; try { const parsed=JSON.parse(storageGet('aperture-bookmarks','[]')); if(Array.isArray(parsed)) savedBookmarks=parsed; } catch (_) {}
const state = { tabs: [], active: null, bookmarks: savedBookmarks, worker: storageGet('aperture-worker', '') };
let frame = $('#page-frame');
let navigationSequence = 0;
let frameLoadTimer = null;
let renderedTabId = null;
if (!window.crossOriginIsolated) $('#isolation-warning')?.classList.remove('hidden');
function newTab(url='') { const tab={id:makeId(),url:'',title:'New tab',history:[],index:-1}; state.tabs.push(tab); state.active=tab.id; renderTabs(); if(url) navigate(url); else showStart(); }
function current(){return state.tabs.find(t=>t.id===state.active)}
function renderTabs(){ $('#tab-strip').innerHTML=''; state.tabs.forEach(t=>{const el=document.createElement('div');el.className='tab'+(t.id===state.active?' active':'');const label=document.createElement('span');label.textContent=t.title;label.title=t.title;label.onclick=()=>{state.active=t.id;renderTabs();t.url?displayCurrent():showStart()};const close=document.createElement('button');close.textContent='×';close.onclick=e=>{e.stopPropagation();state.tabs=state.tabs.filter(x=>x.id!==t.id);if(!state.tabs.length)newTab();else{if(state.active===t.id)state.active=state.tabs[state.tabs.length-1].id;renderTabs();current().url?displayCurrent():showStart()}};el.append(label,close);$('#tab-strip').append(el)}); }
function showStart(){ navigationSequence++; if(frameLoadTimer!==null){clearTimeout(frameLoadTimer);frameLoadTimer=null;} renderedTabId=null; $('#start-page').classList.remove('hidden');frame.classList.add('hidden');$('#loading').classList.add('hidden');$('#error-panel').classList.add('hidden');$('#address').value='';$('#page-host').textContent='APERTURE VIEWER';$('#status-text').textContent='Ready when you are'; }
function normalize(input){let v=input.trim();if(!v)return '';if(!/^https?:\/\//i.test(v)){if(v.includes(' ')||!v.includes('.'))return 'https://www.google.com/search?q='+encodeURIComponent(v);v='https://'+v;}const u=new URL(v);if(!['http:','https:'].includes(u.protocol))throw new Error('Only http and https websites are supported.');return u.href;}
function showError(msg){navigationSequence++;renderedTabId=null;if(frameLoadTimer!==null){clearTimeout(frameLoadTimer);frameLoadTimer=null;}frame.classList.add('hidden');$('#loading').classList.add('hidden');$('#start-page').classList.add('hidden');$('#error-panel').classList.remove('hidden');$('#error-message').textContent=msg;$('#status-text').textContent='Page unavailable';}
async function navigate(input,push=true){
  const sequence=++navigationSequence;
  let url;
  try{url=normalize(input)}catch(e){showError(e.message);return}
  if(!url)return;
  const t=current();
  if(!t){showError('No active tab. Open a new tab and try again.');return;}
  if(!state.worker){showError('Set up your Cloudflare Worker first, then use the gear button beside the address bar to connect it.');return;}
  if(frameLoadTimer!==null){clearTimeout(frameLoadTimer);frameLoadTimer=null;}
  if(push){t.history=t.history.slice(0,t.index+1);t.history.push(url);t.index++;}
  t.url=url;t.title=new URL(url).hostname;renderTabs();
  $('#address').value=url;$('#page-host').textContent=new URL(url).hostname.toUpperCase();
  $('#start-page').classList.add('hidden');$('#error-panel').classList.add('hidden');
  frame.classList.add('hidden');$('#loading').classList.remove('hidden');$('#status-text').textContent='Connecting…';
  const controller=new AbortController();
  const requestTimer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(state.worker.replace(/\/$/, '')+'/?url='+encodeURIComponent(url),{headers:{'Accept':'application/json'},signal:controller.signal,cache:'no-store'});
    const data=await response.json();
    if(sequence!==navigationSequence)return;
    if(!response.ok)throw new Error(data.error||'The proxy could not fetch this website.');
    if(data.type!=='html')throw new Error('This destination did not return an HTML page.');
    const base=data.finalUrl||url;
    if(!window.DOMPurify)throw new Error('The page sanitiser did not load. Refresh Aperture or check your connection; scripts are not enabled without sanitisation.');
    const safe=DOMPurify.sanitize(data.html,{WHOLE_DOCUMENT:true,ADD_TAGS:['base','script','link'],ADD_ATTR:['target','rel'],FORBID_TAGS:['object','embed','meta']});
    const policy="default-src https: http: data: blob:; script-src https: http: data: blob: 'unsafe-inline' 'wasm-unsafe-eval'; style-src https: http: data: blob: 'unsafe-inline'; img-src https: http: data: blob:; font-src https: http: data: blob:; media-src https: http: data: blob:; connect-src https: http: ws: wss: data: blob:; worker-src https: http: blob:; frame-src https: http: data: blob:; object-src 'none'; base-uri https: http:; form-action https: http:";
    const bridge="<script>(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var u;try{u=new URL(a.href,document.baseURI)}catch(_){return}if(!/^https?:$/.test(u.protocol))return;e.preventDefault();parent.postMessage({type:'aperture:navigate',url:u.href},'*')},true);document.addEventListener('submit',function(e){var f=e.target;if(!f||f.tagName!=='FORM')return;e.preventDefault();if((f.method||'get').toLowerCase()!=='get')return;var u;try{u=new URL(f.action||location.href,document.baseURI);new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.append(k,v)})}catch(_){return}if(!/^https?:$/.test(u.protocol))return;parent.postMessage({type:'aperture:navigate',url:u.href},'*')},true)})()</script>";
    let doc=safe;
    if(/<head\b[^>]*>/i.test(doc))doc=doc.replace(/<head\b([^>]*)>/i,match=>match+`<base href="${base.replace(/"/g,'%22')}"><meta http-equiv="Content-Security-Policy" content="${policy}">`+bridge);
    else doc=`<head><base href="${base.replace(/"/g,'%22')}"><meta http-equiv="Content-Security-Policy" content="${policy}">${bridge}</head>`+doc;
    if(sequence!==navigationSequence)return;
    // Replace the browsing context for each navigation. This discards stale documents,
    // prevents late load events from an earlier request, and avoids reusing a crashed frame.
    const nextFrame=frame.cloneNode(false);
    nextFrame.onload=()=>{
      if(sequence!==navigationSequence)return;
      if(frameLoadTimer!==null){clearTimeout(frameLoadTimer);frameLoadTimer=null;}
      $('#status-text').textContent='Page loaded · JavaScript enabled';
    };
    nextFrame.onerror=()=>{if(sequence===navigationSequence)showError('The embedded page failed to load. Try again or open a different site.');};
    frame.replaceWith(nextFrame);frame=nextFrame;renderedTabId=t.id;
    frame.classList.remove('hidden');
    $('#loading').classList.add('hidden');
    $('#status-text').textContent='Loading page…';
    frameLoadTimer=setTimeout(()=>{
      if(sequence!==navigationSequence)return;
      frameLoadTimer=null;
      if(frame.contentDocument && frame.contentDocument.readyState==='complete')$('#status-text').textContent='Page loaded · JavaScript enabled';
      else showError('This page is taking too long to render on this device. Try again or use a lighter website.');
    },25000);
    frame.srcdoc=doc;
  }catch(e){
    if(sequence!==navigationSequence)return;
    const detail=e&&e.name==='AbortError'?'The request timed out after 20 seconds.':(e.message||'Unknown loading error.');
    showError(detail+' If this site requires sign-in cookies, advanced browser APIs or blocks proxy requests, it may not be viewable here.');
  }finally{clearTimeout(requestTimer);}
}
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||!e.data||e.data.type!=='aperture:navigate'||typeof e.data.url!=='string')return;try{const u=new URL(e.data.url);if(['http:','https:'].includes(u.protocol))navigate(u.href)}catch(_){}});function wireFrameLinks(){}
$('#address-form').addEventListener('submit',e=>{e.preventDefault();navigate($('#address').value)});$('#hero-form').addEventListener('submit',e=>{e.preventDefault();navigate($('#hero-address').value)});$('#new-tab').onclick=()=>newTab();$('#back').onclick=()=>{const t=current();if(t.index>0){t.index--;t.url=t.history[t.index];navigate(t.url,false)}};$('#forward').onclick=()=>{const t=current();if(t.index<t.history.length-1){t.index++;t.url=t.history[t.index];navigate(t.url,false)}};$('#reload').onclick=()=>{const t=current();if(t.url)navigate(t.url,false)};$('#retry').onclick=()=>{const t=current();if(t.url)navigate(t.url,false)};$('#bookmark').onclick=()=>{const t=current();if(!t.url)return; if(!state.bookmarks.includes(t.url))state.bookmarks.push(t.url);storageSet('aperture-bookmarks',JSON.stringify(state.bookmarks));$('#status-text').textContent='Bookmark saved';};document.querySelectorAll('[data-url]').forEach(b=>b.addEventListener('click',()=>{switchView('browser');navigate(b.dataset.url)}));
function switchView(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$('#'+view+'-view').classList.add('active');document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#crumb-current').textContent=view.toUpperCase();if(view==='browser'&&current()?.url)displayCurrent()}
function displayCurrent(){const t=current();if(!t)return;if(t.url){if(renderedTabId!==t.id){navigate(t.url,false);return;}$('#address').value=t.url;frame.classList.remove('hidden');$('#start-page').classList.add('hidden');$('#error-panel').classList.add('hidden');$('#loading').classList.add('hidden');}else showStart();}document.querySelectorAll('.side-link').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>switchView(b.dataset.go));$('#show-bookmarks').onclick=()=>{if(!state.bookmarks.length){alert('No bookmarks saved yet.');return;}const choice=prompt('Saved bookmarks:\n'+state.bookmarks.map((x,i)=>`${i+1}. ${x}`).join('\n')+'\n\nEnter a number to open:');const u=state.bookmarks[Number(choice)-1];if(u){switchView('browser');navigate(u)}};
// Utilities
$('#format-json').onclick=()=>{try{$('#json-output').textContent=JSON.stringify(JSON.parse($('#json-input').value),null,2)}catch(e){$('#json-output').textContent='Invalid JSON: '+e.message}};$('#colour').oninput=e=>{$('#colour-value').textContent=e.target.value.toUpperCase();$('#colour-preview').style.background=e.target.value};$('#copy-colour').onclick=async()=>{const value=$('#colour-value').textContent;try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(value);else throw new Error('Clipboard unavailable');$('#status-text').textContent='Colour copied';}catch(_){$('#status-text').textContent='Clipboard unavailable in this browser';}};$('#count-input').oninput=e=>{const s=e.target.value;$('#words').textContent=s.trim()?s.trim().split(/\s+/).length:0;$('#chars').textContent=s.length};$('#encode').onclick=()=>$('#encode-output').textContent=encodeURIComponent($('#encode-input').value);$('#decode').onclick=()=>{try{$('#encode-output').textContent=decodeURIComponent($('#encode-input').value)}catch(e){$('#encode-output').textContent='Invalid encoded text'}};
// Worker setup: prompt on Ctrl+Shift+, so the endpoint can be configured after deployment.
function configureWorker(){const v=prompt('Cloudflare Worker URL (for example https://aperture-proxy.yourname.workers.dev):',state.worker);if(v!==null){state.worker=v.trim().replace(/\/$/,'');storageSet('aperture-worker',state.worker);$('#status-text').textContent='Proxy settings saved';}} $('#settings').onclick=configureWorker;
try { newTab(); }
catch (error) {
  const message = 'Aperture could not start: ' + (error && error.message ? error.message : String(error));
  const status = document.querySelector('#status-text');
  if (status) status.textContent = message;
  const start = document.querySelector('#start-page');
  if (start) {
    start.classList.remove('hidden');
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = message + ' Try updating ChromeOS/Chrome, then reload Aperture.';
    start.prepend(notice);
  }
  console.error(message, error);
}
