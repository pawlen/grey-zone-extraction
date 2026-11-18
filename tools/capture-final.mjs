import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9341; const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const profile='C:/temp/edge-gz-finalcap-'+Date.now();
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'--no-first-run','--hide-scrollbars','--window-size=1600,900','about:blank'],{stdio:'ignore'});
let ws,id=0; const pending=new Map(); const errors=[];
try{
  let target=null;
  for(let i=0;i<60&&!target;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();target=l.find(t=>t.type==='page');}catch(e){} await sleep(500);}
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=(m,p={})=>new Promise(resolve=>{const i=++id;pending.set(i,resolve);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);return;} if(m.method==='Runtime.exceptionThrown') errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)); else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error') errors.push('LOG: '+m.params.entry.text);});
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
  const shot=async(url, name, waitExpr) => {
    await send('Page.navigate',{url:'http://localhost:8080/'+url});
    const start=Date.now(); let ok=false;
    while(Date.now()-start<90000){ try{ok=await ev(waitExpr);}catch(e){ok=false;} if(ok)break; await sleep(400);}
    await sleep(1000);
    const data=await send('Page.captureScreenshot',{format:'png'});
    if(data.result?.data) fs.writeFileSync('shots/'+name+'.png', Buffer.from(data.result.data,'base64'));
    console.log(name, ok?'ok':'timeout');
  };
  await shot('?screen=prep&select=1','screen-prep',"!!window.__game && !document.getElementById('screen-prep').classList.contains('hidden')");
  await shot('?autostart=snow','raid-snow',"!!window.__game && window.__game.state==='raid'");
  await shot('?autostart=farm','raid-farm',"!!window.__game && window.__game.state==='raid'");
  await shot('?autostart=city','raid-city',"!!window.__game && window.__game.state==='raid'");
  await shot('?autostart=factory&weapon=w_ak74','gun-ak74',"!!window.__game && window.__game.state==='raid'");
  console.log('errors', errors.slice(0,10));
}catch(e){console.error(e);}finally{try{ws&&ws.close();}catch(e){} try{edge.kill();}catch(e){} try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}}
