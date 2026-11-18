import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9359; const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const profile='C:/temp/edge-gz-flow-'+Date.now();
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
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result?.result?.value;};
  const boot=async(label)=>{const b=await ev("document.getElementById('boot-error') && !document.getElementById('boot-error').classList.contains('hidden') ? document.getElementById('boot-error').textContent.slice(0,700) : ''"); console.log(label, b?('BOOT '+b):'ok'); return b;};
  await send('Page.navigate',{url:'http://localhost:8080/'});
  for(let i=0;i<120;i++){ if(await ev("!!window.__game && !document.getElementById('loading-screen').classList.contains('hidden') === false"))break; await sleep(400);}
  await sleep(1000);
  await boot('menu');
  await ev("document.querySelector('#screen-menu [data-action=\"prep\"]').click()"); await sleep(800); await boot('prep');
  // 点击仓库第一张物品卡，触发详情面板
  await ev("const t=document.querySelector('#screen-prep .stash-list .item-card'); if(t) t.click();"); await sleep(400); await boot('prep-item');
  // 打开普通搜刮/仓库/商人界面
  await ev("document.querySelector('#screen-prep [data-action=\"openTrader\"]').click()"); await sleep(700); await boot('trader');
  await ev("document.querySelector('#screen-trader [data-action=\"sell\"]')?.click()"); await sleep(500); await boot('trader-sell');
  await ev("document.querySelector('#screen-trader [data-action=\"prepBack\"]').click()"); await sleep(600); await boot('back-prep');
  const maps=['factory','forest','port','snow','farm','city'];
  for(const map of maps){
    await send('Page.navigate',{url:`http://localhost:8080/?autostart=${map}&spawn=0`});
    for(let i=0;i<200;i++){try{if(await ev("!!window.__game && window.__game.state==='raid'"))break;}catch(e){} await sleep(400);}
    await sleep(800);
    const info=await ev(`(()=>{const g=__game; return {map:g.map&&g.map.id,state:g.state,enemies:g.enemies.length,containers:g.world.containers.length};})()`);
    console.log('raid',map,JSON.stringify(info));
    await boot(map+' boot');
    // 局内动作：换弹、打开/关闭背包、搜刮最近容器
    await ev("try{__game.player.startReload()}catch(e){console.error('reload',e)}"); await sleep(300);
    await ev("try{__game.openOverlay('inventory')}catch(e){console.error('inv',e)}"); await sleep(300);
    await ev("try{__game.closeOverlay()}catch(e){console.error('close',e)}"); await sleep(300);
    await ev("try{const c=__game.world.containers.find(x=>!x.invisible); if(c){c.open();__game.openOverlay('loot',c);}}catch(e){console.error('loot',e)}"); await sleep(300);
    await ev("try{__game.closeOverlay()}catch(e){console.error('closeloot',e)}"); await sleep(300);
    await boot(map+' actions');
  }
  console.log('errors',errors.slice(0,20));
}catch(e){console.error('script error',e);}finally{try{ws&&ws.close();}catch(e){} try{edge.kill();}catch(e){} try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}}
