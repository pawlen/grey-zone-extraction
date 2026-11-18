import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9358; const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const profile='C:/temp/edge-gz-err-'+Date.now();
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'--no-first-run','--hide-scrollbars','--window-size=1600,900','about:blank'],{stdio:'ignore'});
let ws,id=0; const pending=new Map(); const errors=[];
try{
  let target=null;
  for(let i=0;i<60&&!target;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();target=l.find(t=>t.type==='page');}catch(e){} await sleep(500);}
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=(m,p={})=>new Promise(resolve=>{const i=++id;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);return;} if(m.method==='Runtime.exceptionThrown') errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)); else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error') errors.push('LOG: '+m.params.entry.text); else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errors.push('CONSOLE: '+m.params.args.map(a=>a.value??a.description??'').join(' '));});
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate',{url:'http://localhost:8080/'});
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result?.result?.value;};
  const state=async(tag)=>{
    const s=await ev(`(() => { const b=document.getElementById('boot-error'); return JSON.stringify({tag:${JSON.stringify(tag)},state:window.__game&&window.__game.state,menu:!document.getElementById('screen-menu').classList.contains('hidden'),prep:!document.getElementById('screen-prep').classList.contains('hidden'),loading:!document.getElementById('loading-screen').classList.contains('hidden'),boot:b&&!b.classList.contains('hidden')?b.textContent.slice(0,600):'' }); })()`);
    console.log(s);
    return JSON.parse(s);
  };
  for(let i=0;i<120;i++){ if(await ev("!!window.__game && !document.getElementById('loading-screen').classList.contains('hidden') === false")) break; await sleep(400); }
  await sleep(1200);
  await state('menu');
  await ev("document.querySelector('#screen-menu [data-action=\"prep\"]').click()");
  await sleep(1200);
  await state('prep');
  const btn = await ev("[...document.querySelectorAll('#screen-prep [data-action=\"startRaid\"]')].map(b=>({disabled:b.disabled,text:b.textContent.trim()}))");
  console.log('start button', JSON.stringify(btn));
  await ev("document.querySelector('#screen-prep [data-action=\"startRaid\"]').click()");
  await sleep(2500);
  const st=await state('after-start');
  const d=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('shots/error-check.png',Buffer.from(d.result.data,'base64'));
  await ev("window.__game && window.__game.ui && window.__game.ui.showAnnouncement && window.__game.ui.showAnnouncement()");
  await sleep(300);
  await state('announcement');
  console.log('errors', errors.slice(0,15));
}catch(e){console.error('script error',e);}finally{try{ws&&ws.close();}catch(e){} try{edge.kill();}catch(e){} try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}}
