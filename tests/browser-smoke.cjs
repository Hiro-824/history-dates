/* eslint-disable @typescript-eslint/no-require-imports -- These tests run directly in Node.js as CommonJS. */
// Local headless Chrome only. No browser connector or extra npm package.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const base=process.env.HISTORY_BASE_URL||'http://127.0.0.1:3105';
const chromeBin=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const events=require('../data/events.json');
const byLine=line=>events.find(e=>e.draftLines.includes(line));
(async()=>{
 // Verify every route on the server under test, including a long-running dev server.
 for(const route of ['/','/library','/records','/settings']){
  const response=await fetch(base+route,{redirect:'manual'});
  assert.equal(response.status,route==='/settings'?307:200,`HTTP response for ${route}`);
  assert.ok(!(await response.text()).includes('Element type is invalid'),`Invalid React export on ${route}`);
 }
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'oboeyo-headless-'));
 const chrome=spawn(chromeBin,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-default-apps',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
 let socket;
 try{
  let port;
  for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await delay(100);}}
  assert.ok(port,'Chrome debugging port');
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  let seq=0;const pending=new Map();const eventListeners=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method)eventListeners.get(m.method)?.(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression:`(()=>{const visibleAll=s=>[...window.document.querySelectorAll(s)].filter(e=>e.getClientRects().length>0);const visible=s=>visibleAll(s)[0]||null;return (${expression.replaceAll('document.querySelectorAll(', 'visibleAll(').replaceAll('document.querySelector(', 'visible(')});})()`,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''));return r.result.value;};
  const until=async(expression,label,timeout=8000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(70);}throw new Error('Timeout: '+label+'\n'+await evaluate('document.body.innerText'));};
  const navigate=async route=>{await call('Page.navigate',{url:base+route});await until(`document.readyState==='complete'&&!!document.querySelector('.site-header')`,'page ready');};
  const click=async selector=>{assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
  const textClick=async(text,tag='button')=>{const code=`[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;assert.ok(await evaluate(`!!(${code})`),text);await evaluate(`(${code}).click()`);};
  const labelClick=text=>textClick(text,'label');
  const select=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
  const type=async(selector,text)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await call('Input.insertText',{text});};
  const input=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  const history=()=>call('Page.getNavigationHistory');
  const traverse=async delta=>{const h=await history();await call('Page.navigateToHistoryEntry',{entryId:h.entries[h.currentIndex+delta].id});};
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  if(process.env.HISTORY_SCROLL_ONLY==='1'||process.env.HISTORY_NAVIGATION_ONLY!=='1'){
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:568,deviceScaleFactor:1,mobile:true});
   await navigate('/');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'scroll test home');
   const assertHomeScroll=async label=>{
    await until(`location.pathname==='/'&&!location.hash&&!document.querySelector('dialog[open]')&&!!document.querySelector('.start-button:not(:disabled)')`,label+' home ready');
    const state=await evaluate(`({overflow:getComputedStyle(document.body).overflowY,inline:document.body.style.overflow,classes:document.body.className,height:document.documentElement.scrollHeight,viewport:innerHeight})`);
    assert.notEqual(state.overflow,'hidden',label+' '+JSON.stringify(state));
    assert.ok(state.height>state.viewport,label+' scrollable content');
    await evaluate('window.scrollTo(0,0)');
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:140,y:250,deltaX:0,deltaY:180});
    await until('window.scrollY>0',label+' wheel scroll');
   };
   await assertHomeScroll('initial');
   for(let i=0;i<4;i++){
    await click('.scope-picker');await until(`!!document.querySelector('dialog[open]')`,'scope open');
    if(i===0)await click('.settings-modal .modal-header button');
    if(i===1)await click('.settings-modal .modal-footer button');
    if(i===2){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});}
    if(i===3)await traverse(-1);
    await assertHomeScroll('scope close '+i);
   }
   await click('.start-button');await until(`!!document.querySelector('#year-answer')`,'scroll study');
   const path=await evaluate('location.pathname');
   await click('.quiz-toolbar button');await until(`!!document.querySelector('dialog[open]')`,'end open');
   await traverse(-1);await assertHomeScroll('back while study dialog is open');
   await traverse(1);await until(`location.pathname===${JSON.stringify(path)}&&!!document.querySelector('#year-answer')`,'restore study');
   if(await evaluate(`!!document.querySelector('dialog[open]')`))await click('dialog[open] .modal-header button');
   await click('.site-header nav a[href="/"]');await assertHomeScroll('restored study return');
   for(const route of ['/library','/records']){
    await click(`.site-header nav a[href="${route}"]`);await until(`location.pathname===${JSON.stringify(route)}`,'navigate '+route);
    await traverse(-1);await assertHomeScroll('back from '+route);
   }
   await click('.scope-picker');await until(`!!document.querySelector('.settings-modal[open]')`,'native close scope');
   assert.equal(await evaluate(`getComputedStyle(document.body).overflowY`),'hidden','open dialog locks background');
   // Native close must release scrolling even before React/hash state catches up.
   await evaluate(`document.querySelector('.settings-modal[open]').close()`);
   assert.notEqual(await evaluate(`getComputedStyle(document.body).overflowY`),'hidden','native close immediately releases scrolling');
   await traverse(-1);await assertHomeScroll('native close cleanup');
   // A swipe starting on the floating start card must still scroll the page.
   await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
   await evaluate('window.scrollTo(0,0)');
   const point=await evaluate(`(()=>{const r=document.querySelector('.home-start-dock').getBoundingClientRect();return {x:r.left+18,y:r.top+18}})()`);
   await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
   for(let y=point.y-30;y>point.y-180;y-=30)await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y}]});
   await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await until('window.scrollY>0','touch scrolling over fixed start card');
   console.log('Home scroll passed: wheel and touch input, all scope close methods, native dialog close, interrupted/restored dialogs and cached navigation.');
   if(process.env.HISTORY_SCROLL_ONLY==='1')return;
   await evaluate('localStorage.clear()');
   await call('Emulation.setTouchEmulationEnabled',{enabled:false});
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  }
  // Hold route responses to verify feedback under genuinely pending navigation.
  const held=[];const pausedRoutes=new Set(['/library','/records','/study/','/results/']);
  eventListeners.set('Fetch.requestPaused',params=>{
   const pathname=new URL(params.request.url).pathname;
   if([...pausedRoutes].some(route=>pathname===route||pathname.startsWith(route.endsWith('/')?route:route+'/')))held.push(params);
   else call('Fetch.continueRequest',{requestId:params.requestId}).catch(()=>{});
  });
  const releaseRoute=async route=>{
   pausedRoutes.delete(route);
   const requests=held.filter(p=>new URL(p.request.url).pathname.startsWith(route));
   for(const request of requests){held.splice(held.indexOf(request),1);await call('Fetch.continueRequest',{requestId:request.requestId});}
  };
  await call('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Fetch',requestStage:'Request'}]});
  await navigate('/');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'navigation test home');
  await until(`!document.querySelector('.navigation-progress,.loading-content')`,'quiet feedback before navigation');
  await evaluate(`(()=>{window.navigationFeedbackEvents=[];window.navigationFeedbackObserver=new MutationObserver(records=>{for(const record of records)for(const [type,nodes] of [['added',record.addedNodes],['removed',record.removedNodes]])for(const node of nodes)if(node instanceof Element&&node.matches('.navigation-progress'))window.navigationFeedbackEvents.push({type,at:performance.now()});});window.navigationFeedbackObserver.observe(document.body,{childList:true,subtree:true});})()`);
  for(const [route,title] of [['/records','学習記録'],['/library','問題一覧']]){
   await evaluate('(window.navigationFeedbackEvents=[],window.navigationStartedAt=performance.now())');
   await click(`.site-header nav a[href="${route}"]`);
   await delay(70);
   assert.equal(await evaluate(`!!document.querySelector('.navigation-progress')`),false,'brief waits do not flash a notice');
   if(route==='/library'){
    await until(`!!document.querySelector('.navigation-progress')`,'delayed menu feedback');
    assert.equal(await evaluate(`document.querySelectorAll('.navigation-progress').length`),1,'one shared loading notice');
    await evaluate(`(()=>{window.progressNode=document.querySelector('.navigation-progress');return true;})()`);
    await delay(40);
    assert.equal(await evaluate(`document.querySelector('.navigation-progress')===window.progressNode`),true,'notice stays mounted during a wait');
   }
   await releaseRoute(route);
   await until(`location.pathname===${JSON.stringify(route)}&&document.querySelector('h1')?.textContent===${JSON.stringify(title)}&&!document.querySelector('.loading-content')`,'menu content ready '+route);
   const navigationDuration=await evaluate('performance.now()-window.navigationStartedAt');
   await until(`!document.querySelector('.navigation-progress')`,'menu feedback cleared '+route);
   await delay(300);
   const feedbackEvents=await evaluate('window.navigationFeedbackEvents');
   if(route==='/records'&&navigationDuration<220)assert.equal(feedbackEvents.length,0,'fast navigation never shows a notice');
   else if(route==='/library'){
    assert.deepEqual(feedbackEvents.map(e=>e.type),['added','removed'],'slow navigation shows one continuous notice');
    assert.ok(feedbackEvents[1].at-feedbackEvents[0].at>=280,'a shown notice does not disappear in a flash');
   }
  }
  await evaluate('window.navigationFeedbackObserver.disconnect()');
  await click('.site-header nav a[href="/"]');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'home for slow study');
  await click('.unseen-control input');
  const single=events.find(e=>!e.note&&!e.answerPrecision&&events.filter(x=>x.unitId===e.unitId||x.relatedUnitIds?.includes(e.unitId)).length===1);
  assert.ok(single,'single-question scope without notes');
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));s.settings={...s.settings,scopeMethod:'units',unitIds:[${JSON.stringify(single.unitId)}],subject:'both',priorities:[],mode:'exact'};localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
  await call('Page.reload');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'single-question home');
  await evaluate(`(()=>{const b=document.querySelector('.start-button');b.click();b.click();})()`);
  await until(`!!document.querySelector('.navigation-progress,.loading-content')`,'study preparation feedback');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.length`),1,'double start creates one session');
  assert.ok(await evaluate(`!document.querySelector('.start-button')||document.querySelector('.start-button').disabled`),'start disabled while pending');
  await releaseRoute('/study/');await until(`!!document.querySelector('#year-answer')&&!document.querySelector('.navigation-progress,.loading-content')`,'slow study ready');
  const firstStudyPath=await evaluate('location.pathname');
  await click('.unknown-button');await click('.answer-button');
  await until(`!!document.querySelector('.result-overview')`,'local result without route response');
  assert.equal(await evaluate('location.pathname'),firstStudyPath,'result visible before results URL response');
  await delay(250);assert.ok(await evaluate(`!!document.querySelector('.result-overview')&&!document.querySelector('.loading-content')`),'result stays visible while response is held');
  assert.equal(await evaluate(`document.querySelectorAll('.result-row').length`),1);
  await releaseRoute('/results/');await until(`location.pathname.startsWith('/results/')&&!document.querySelector('.navigation-progress,.loading-content')`,'results URL catches up');
  pausedRoutes.add('/study/');
  await evaluate(`(()=>{const b=document.querySelector('.result-actions button:first-child');b.click();b.click();})()`);
  await until(`!!document.querySelector('.navigation-progress,.loading-content,#year-answer')`,'retry feedback or immediate page');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.length`),2,'double retry creates one session');
  await releaseRoute('/study/');await until(`!!document.querySelector('#year-answer')&&!document.querySelector('.navigation-progress,.loading-content')`,'retry ready');
  pausedRoutes.add('/results/');
  const retryPath=await evaluate('location.pathname');
  if(single.era==='BCE')await click('input[aria-label="紀元前"]');
  await type('#year-answer',String(single.year));await click('.answer-button');
  await until(`!!document.querySelector('.result-overview')`,'automatic final result without route response',4000);
  assert.ok(await evaluate(`location.pathname===${JSON.stringify(retryPath)}||location.pathname.startsWith('/results/')`));
  await delay(250);
  assert.ok(await evaluate(`document.querySelector('.result-overview').textContent.includes('100%')`));
  await releaseRoute('/results/');await until(`location.pathname.startsWith('/results/')`,'automatic results URL');
  await click('.result-actions button:nth-child(2)');await until(`!!document.querySelector('#year-answer')&&!document.querySelector('.navigation-progress')`,'repeat after pending resets');
  pausedRoutes.add('/results/');
  const earlyPath=await evaluate('location.pathname');
  await click('.quiz-toolbar button');await until(`!!document.querySelector('dialog[open]')`,'end dialog');
  await click('dialog[open] .modal-footer .primary');
  await until(`!!document.querySelector('.result-overview')&&!document.querySelector('dialog[open]')`,'early result immediately');
  assert.ok(await evaluate(`location.pathname===${JSON.stringify(earlyPath)}||location.pathname.startsWith('/results/')`));
  await delay(250);assert.ok(await evaluate(`!!document.querySelector('.result-overview')&&!document.querySelector('.loading-content')`));
  await releaseRoute('/results/');await until(`location.pathname.startsWith('/results/')`,'early results URL');
  await call('Fetch.disable');eventListeners.delete('Fetch.requestPaused');
  await click('.result-actions button:nth-child(2)');await until(`!!document.querySelector('#year-answer')&&!document.querySelector('.navigation-progress')`,'active study before menu exit');
  await click('.site-header nav a[href="/"]');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'home after slow routes');
  assert.equal(await evaluate(`!!document.querySelector('.navigation-progress,.loading-content')`),false,'no stale progress after returning');
  assert.notEqual(await evaluate(`getComputedStyle(document.body).overflowY`),'hidden','leaving an active study unlocks page scrolling');
  console.log('Pending navigation passed: held route responses and immediate cached navigation, duplicate prevention, stable manual/automatic/early results, and indicator cleanup.');
  await evaluate('localStorage.clear()');
  if(process.env.HISTORY_NAVIGATION_ONLY==='1')return;
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/');
  await until(`!!document.querySelector('.start-button:not(:disabled)')`,'home ready');
  const homeLayout=await evaluate(`(()=>{const subject=document.querySelector('.home-basics').getBoundingClientRect(),scope=document.querySelector('.scope-field').getBoundingClientRect(),mode=document.querySelector('.mode-field').getBoundingClientRect();return {subject:subject.bottom,scopeTop:scope.top,scopeBottom:scope.bottom,mode:mode.top}})()`);
  assert.ok(homeLayout.scopeTop>=homeLayout.subject&&homeLayout.mode>=homeLayout.scopeBottom);
  await click('.unseen-control input');await click('.weak-control input');
  await call('Page.reload');await until(`document.querySelector('.unseen-control input')?.checked&&document.querySelector('.weak-control input')?.checked`,'both priority flags persist');
  await click('.unseen-control input');await click('.weak-control input');
  for(const [route,title] of [['/library','問題一覧'],['/records','学習記録']]){
   await click(`.site-header nav a[href="${route}"]`);
   await until(`location.pathname===${JSON.stringify(route)}&&document.querySelector('h1')?.textContent===${JSON.stringify(title)}`,'navigation to '+title);
   await call('Page.reload');
   await until(`document.querySelector('h1')?.textContent===${JSON.stringify(title)}`,'direct render of '+title);
  }
  await navigate('/settings');
  await until(`location.pathname==='/'&&location.hash==='#settings'&&!!document.querySelector('.settings-modal[open] .modal-footer button:not(:disabled)')`,'legacy URL opens home modal');
  assert.equal(await evaluate(`!!document.querySelector('.settings-modal .priority-field,.settings-modal .mode-grid,.settings-modal .count-field,.settings-modal .study-preferences')`),false);
  assert.equal(await evaluate(`document.body.innerText.includes('学習状況で絞り込み')||document.body.innerText.includes('保存したプリセット')`),false);
  assert.equal(await evaluate(`document.querySelector('.settings-modal .modal-footer button').textContent`),'この範囲を使う');
  const modalGeometry=await evaluate(`(()=>{const dialog=document.querySelector('.settings-modal'),body=dialog.querySelector('.modal-body'),footer=dialog.querySelector('.modal-footer').getBoundingClientRect();return {width:document.documentElement.scrollWidth,viewport:innerWidth,footerBottom:footer.bottom,height:innerHeight,scrollable:body.scrollHeight>body.clientHeight,locked:getComputedStyle(document.body).overflowY==='hidden'}})()`);
  assert.equal(modalGeometry.width,modalGeometry.viewport);assert.ok(modalGeometry.footerBottom<=modalGeometry.height);assert.equal(modalGeometry.locked,true);
  await click('.settings-modal .modal-header button');
  await until(`location.pathname==='/'&&!location.hash&&!document.querySelector('dialog[open]')&&getComputedStyle(document.body).overflowY!=='hidden'`,'close direct modal without leaving home');
  await evaluate(`document.querySelector('.scope-picker').focus()`);
  await click('.scope-picker');
  await until(`!!document.querySelector('.settings-modal[open]')`,'open modal in place');
  await traverse(-1);
  await until(`location.pathname==='/'&&!location.hash&&!document.querySelector('dialog[open]')`,'back closes modal');
  await until(`document.activeElement===document.querySelector('.scope-picker')`,'focus returns to modal opener',2000);
  await traverse(1);await until(`!!document.querySelector('.settings-modal[open]')`,'forward reopens modal');
  await call('Page.reload');await until(`!!document.querySelector('.settings-modal[open] .modal-footer button:not(:disabled)')`,'modal restored after reload');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until(`!document.querySelector('dialog[open]')&&!location.hash`,'Escape closes modal');
  await click('.scope-picker');await until(`!!document.querySelector('.settings-modal[open]')`,'reopen settings');
  assert.ok(await evaluate(`document.title.includes('覚えよ')&&!document.body.innerText.includes('このブラウザに自動保存')`));
  await labelClick('単元から選択');
  await until(`document.querySelectorAll('[data-group-id^="W"]').length===21&&document.querySelectorAll('[data-group-id^="J"]').length===13`,'34 unit groups');
  await click('[data-group-id="J10"] summary');
  await click('[data-group-id="J10"] .unit-children label:nth-child(3) input');
  await click('[data-group-id="J10"] .unit-children label:nth-child(2) input');
  await until(`document.querySelector('[data-group-id="J10"] summary input').indeterminate`,'partial selection');
  assert.equal(await evaluate(`document.querySelector('.settings-modal .modal-footer .target-count strong').textContent`),'3');
  await click('.settings-modal .modal-footer button');
  await until(`!document.querySelector('dialog[open]')&&!location.hash`,'apply scope returns home');
  assert.ok(await evaluate(`document.querySelector('.scope-selected-units').textContent.includes('明治維新')`));
  await click('.scope-picker');await until(`!!document.querySelector('.settings-modal[open]')`,'reopen scope');
  await labelClick('地域×時代から選択');
  await select('.region-selector>label select','china');
  await until(`document.querySelector('.region-selector>label select').value==='china'`,'china region');
  await select('.region-selector .two-fields label:nth-child(1) select','china-05');
  await select('.region-selector .two-fields label:nth-child(2) select','china-06');
  await until(`document.querySelector('.range-caption').textContent==='618年〜1,279年'`,'regional dates');
  assert.equal(Number(await evaluate(`document.querySelector('.settings-modal .modal-footer .target-count strong').textContent`)),events.filter(e=>e.subject==='world'&&e.regions.includes('china')&&e.era==='CE'&&e.year>=618&&e.year<=1279).length);
  await labelClick('単元から選択');await textClick('選択を解除');
  await input('input[aria-label="単元名で検索"]','宗教改革');
  await until(`!!document.querySelector('[data-group-id="W13"] .unit-children input')`,'unit search');
  await click('[data-group-id="W13"] .unit-children input');
  await click('.settings-modal .modal-footer button');
  await until(`!document.querySelector('dialog[open]')&&!location.hash`,'scope selected before study');
  await click('.home-page .mode-grid .mode-option:nth-child(3)');
  await click('.start-button');
  await until(`location.pathname.startsWith('/study/')&&!!document.querySelector('#year-answer')&&!document.querySelector('dialog[open]')&&document.body.style.overflow===''&&getComputedStyle(document.body).overflowY==='hidden'`,'study route closes modal');
  const studyPath=await evaluate('location.pathname');
  // Keep this navigation/persistence scenario to two actual draft questions.
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));s.sessions.at(-1).eventIds=${JSON.stringify([byLine(203).id,byLine(202).id])};localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
  await call('Page.reload');
  await until(`!!document.querySelector('#year-answer')`,'two-question session');
  assert.equal(await evaluate(`document.querySelector('.fixed-digits').textContent`),'48');
  await type('#year-answer','16');await click('.era-toggle label:first-of-type');
  await call('Page.reload');
  await until(`document.querySelector('#year-answer')?.value==='16'&&document.querySelector('.era-toggle input[aria-label="紀元前"]').checked`,'draft and era restore');
  await click('.era-toggle label:last-of-type');
  const geometry=await evaluate(`(()=>{const a=document.querySelector('#year-answer'),b=document.querySelector('.fixed-digits'),sa=getComputedStyle(a),sb=getComputedStyle(b),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return {fontsEqual:['fontFamily','fontSize','fontWeight','color','letterSpacing','lineHeight'].every(k=>sa[k]===sb[k]),gap:br.left-ar.right,topDelta:Math.abs(ar.top-br.top),viewport:innerWidth,width:document.documentElement.scrollWidth}})()`);
  assert.equal(geometry.fontsEqual,true);assert.ok(Math.abs(geometry.gap)<1,JSON.stringify(geometry));assert.ok(geometry.topDelta<2,JSON.stringify(geometry));assert.equal(geometry.width,geometry.viewport);
  const before=await history();
  await click('.answer-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='正解'`,'correct feedback');
  await until(`document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='2/2'`,'correct automatic next',4000);
  const after=await history();assert.equal(after.entries.length,before.entries.length);
  await type('#year-answer','14');await click('.answer-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='不正解'`,'wrong feedback');
  await delay(1200);assert.equal(await evaluate('location.pathname'),studyPath);
  await call('Page.reload');
  await until(`document.querySelector('#year-answer')?.value==='14'&&document.querySelector('.feedback-status')?.textContent==='不正解'`,'wrong feedback restore');
  await click('.answer-button');
  await until(`location.pathname.startsWith('/results/')&&document.querySelector('h1')?.textContent==='学習結果'`,'results route');
  const resultsPath=await evaluate('location.pathname');
  await call('Page.reload');await until(`document.querySelector('.result-overview')?.textContent.includes('50%')`,'results restore');
  await traverse(-1);await until(`location.pathname==='/'&&!location.hash&&!document.querySelector('dialog[open]')`,'back returns to home');
  assert.equal(await evaluate(`document.querySelector('.home-page .mode-grid label:nth-child(3) input').checked`),true);
  await traverse(1);await until(`location.pathname===${JSON.stringify(resultsPath)}&&!!document.querySelector('.result-actions')&&!document.querySelector('dialog[open]')&&getComputedStyle(document.body).overflowY!=='hidden'`,'forward results without modal');
  await navigate(studyPath);await until(`location.pathname===${JSON.stringify(resultsPath)}&&document.querySelector('h1')?.textContent==='学習結果'`,'completed study goes directly to result');
  await click('.result-actions button:first-child');
  await until(`location.pathname.startsWith('/study/')&&document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='1/1'`,'retry only wrong');
  await click('.site-header nav a[href="/"]');
  await until(`location.pathname==='/'&&!!document.querySelector('.mode-grid')`,'home');
  await click('.mode-grid .mode-option:nth-child(4)');
  await click('.review-panel button');
  await until(`document.querySelector('.question-title')?.textContent.includes('三十年戦争勃発')&&document.querySelector('#year-answer')?.getAttribute('aria-label')==='世紀を答える'`,'shared review in century mode');
  await type('#year-answer','17');await click('.answer-button');
  await until(`location.pathname.startsWith('/results/')`,'final correct auto results',4000);
  const shared=await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).history[${JSON.stringify(byLine(202).id)}]`);
  assert.equal(shared.attempts,2);assert.equal(shared.correct,1);assert.equal(shared.incorrect,1);assert.equal(shared.modes,undefined);
  await navigate('/settings');await until(`!!document.querySelector('.settings-modal .modal-footer button:not(:disabled)')`,'settings repeat');
  await click('.settings-modal .modal-footer button');
  await until(`!document.querySelector('dialog[open]')&&!location.hash`,'scope confirmation');
  await click('.start-button');await until(`!!document.querySelector('#year-answer')`,'study for timer check');
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));s.sessions.at(-1).eventIds=${JSON.stringify([byLine(203).id,byLine(202).id])};localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
  await call('Page.reload');await until(`document.querySelector('.question-title')?.textContent.includes('ウェストファリア条約')`,'new study');
  await type('#year-answer','17');await click('.answer-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='正解'`,'timer started');
  const cancelId=await evaluate(`location.pathname.split('/').at(-1)`);
  await click('.site-header nav a[href="/"]');await until(`location.pathname==='/'`,'leave study');
  await delay(1300);
  assert.equal(await evaluate('location.pathname'),'/');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.find(s=>s.id===${JSON.stringify(cancelId)}).index`),0);
  // New draft content: notes appear only after answering and remain readable.
  const seedStudy=async(eventIds,id,mode='exact')=>{
   await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));s.sessions.push({id:${JSON.stringify(id)},eventIds:${JSON.stringify(eventIds)},settings:{...s.settings,mode:${JSON.stringify(mode)}},index:0,answers:[],input:'',era:'CE',stage:'active',createdAt:new Date().toISOString(),completedAt:null});localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
   await navigate('/study/'+id);await until(`!!document.querySelector('#year-answer')`,'seeded question');
  };
  const richHintEvent=events.find(e=>events.filter(x=>x.year===e.year&&x.era===e.era&&x.id!==e.id).length>3);
  const noHintEvent=events.find(e=>events.filter(x=>x.year===e.year&&x.era===e.era).length===1);
  await seedStudy([richHintEvent.id,noHintEvent.id],'same-year-hints');
  assert.equal(await evaluate(`!!document.querySelector('.question-hint')`),false,'hints hidden initially');
  await type('#year-answer','1');await click('.hint-button');
  await until(`document.querySelectorAll('.question-hint li').length===3`,'three same-year hints');
  const hintNames=await evaluate(`[...document.querySelectorAll('.question-hint li')].map(e=>e.textContent)`);
  assert.equal(new Set(hintNames).size,3);
  const expectedHints=events.filter(e=>e.id!==richHintEvent.id&&e.year===richHintEvent.year&&e.era===richHintEvent.era).map(e=>e.name.replace(/（上[0-9０-９]+桁(?:を答える|だけでよい)）/g,''));
  assert.ok(hintNames.every(name=>expectedHints.includes(name)));
  assert.equal(await evaluate(`document.querySelector('#year-answer').value`),'1','hint preserves answer draft');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.at(-1).answers.length`),0,'hint does not record an attempt');
  await type('#year-answer','2');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.question-hint li')].map(e=>e.textContent)`),hintNames,'typing keeps sampled hints');
  await click('.hint-button');assert.equal(await evaluate(`!!document.querySelector('.question-hint')`),false);
  await click('.hint-button');assert.deepEqual(await evaluate(`[...document.querySelectorAll('.question-hint li')].map(e=>e.textContent)`),hintNames,'reopening keeps hints for the question');
  await click('.unknown-button');await until(`!!document.querySelector('.feedback')&&!document.querySelector('.question-hint')`,'answer replaces hints');
  await click('.answer-button');await until(`document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='2/2'`,'next hint question');
  assert.equal(await evaluate(`!!document.querySelector('.question-hint')`),false,'next question resets hints');
  await click('.hint-button');await until(`document.querySelector('.question-hint p')?.textContent==='同じ年の別の出来事は登録されていません。'`,'no same-year events');
  const noted=byLine(78),plain=byLine(223);
  await seedStudy([noted.id,plain.id],'draft-notes-test');
  assert.equal(await evaluate(`!!document.querySelector('.event-note')`),false);
  await type('#year-answer','751');await click('.answer-button');
  await until(`!!document.querySelector('.event-note')`,'note revealed');
  assert.equal(await evaluate(`document.querySelector('.event-note p').textContent`),noted.note);
  assert.equal(await evaluate(`document.querySelector('.event-note h4').textContent`),'語呂合わせ・備考');
  await delay(1300);
  assert.equal(await evaluate(`document.querySelector('.progress-text').textContent.replaceAll(' ','')`),'1/2');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  await click('.answer-button');await until(`document.querySelector('.question-title')?.textContent.includes('アメリカ独立宣言')`,'next draft question');
  assert.equal(await evaluate(`!!document.querySelector('.event-note')`),false);
  await type('#year-answer','1776');await click('.answer-button');await until(`location.pathname.startsWith('/results/')`,'plain correct auto advance',4000);
  await seedStudy([byLine(24).id],'draft-wrong-note');
  await type('#year-answer','900');await click('.answer-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='不正解'&&!!document.querySelector('.event-note')`,'note on incorrect answer');
  await navigate('/library');
  await type('input[aria-label="出来事名・年号で検索"]','カロリング');
  await until(`document.querySelectorAll('.event-row').length===1`,'draft library search');
  await click('.event-name-button');await until(`!!document.querySelector('dialog .event-note')`,'detail note');
  assert.equal(await evaluate(`document.querySelector('dialog .event-note p').textContent`),noted.note);
  assert.ok(Number(await evaluate(`parseFloat(getComputedStyle(document.querySelector('dialog .detail-metadata .priority-stars')).fontSize)`))>=20);
  assert.equal(await evaluate(`!!document.querySelector('dialog .source-link')`),false);
  await click('dialog .modal-header button');
  for(const [line,prefix,suffix] of [[175,'13','00'],[232,'182','0']]){
   await seedStudy([byLine(line).id],'draft-precision-'+line);
   assert.equal(await evaluate(`!!document.querySelector('.answer-label,.question-heading')`),false);
   assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'');
   assert.equal(await evaluate(`document.querySelector('#year-answer').maxLength`),6);
   assert.ok(!(await evaluate(`document.querySelector('.question-title').textContent`)).includes('上2桁'));
   assert.equal(await evaluate(`document.querySelector('.fixed-digits').textContent`),suffix);
   await type('#year-answer',prefix);await click('.answer-button');
   await until(`document.querySelector('.feedback-status')?.textContent==='正解'`,'draft reduced-digit answer');
   await until(`location.pathname.startsWith('/results/')`,'reduced-digit completion',4000);
  }
  await seedStudy([byLine(19).id,byLine(203).id],'unknown-answer-test');
  assert.equal(await evaluate(`!!document.querySelector('.question-heading,.answer-label')`),false);
  assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'');
  assert.equal(await evaluate(`document.querySelector('#year-answer').style.width`),'1ch');
  await type('#year-answer','1974');
  assert.equal(await evaluate(`document.querySelector('#year-answer').value`),'1974');
  const unknownBefore=await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).history[${JSON.stringify(byLine(19).id)}]?.attempts||0`);
  await click('.unknown-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='わからない'`,'unknown feedback');
  assert.equal(await evaluate(`document.querySelector('.correct-year').textContent`),'57年');
  assert.equal(await evaluate(`document.querySelector('.answer-detail strong').textContent`),'わからない');
  assert.equal(await evaluate(`!!document.querySelector('.unknown-button')`),false);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('.answer-button')`),true);
  await delay(1200);assert.equal(await evaluate(`document.querySelector('.progress-text').textContent.replaceAll(' ','')`),'1/2');
  await call('Page.reload');await until(`document.querySelector('.feedback-status')?.textContent==='わからない'`,'unknown feedback survives reload');
  const unknownStore=await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2'))`);
  assert.equal(unknownStore.history[byLine(19).id].attempts,unknownBefore+1);
  assert.equal(unknownStore.history[byLine(19).id].review,true);
  assert.equal(unknownStore.sessions.at(-1).answers[0].unknown,true);
  assert.equal(unknownStore.sessions.at(-1).answers[0].input,'');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,autoRepeat:true});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(`document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='2/2'`,'Enter advances after unknown without skipping');
  assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'');
  assert.equal(await evaluate(`document.querySelector('#year-answer').style.width`),'1ch');
  await click('.answer-button');await until(`!!document.querySelector('#answer-error')`,'normal empty answer rejected');
  await click('.unknown-button');await until(`document.querySelector('.feedback-status')?.textContent==='わからない'&&!document.querySelector('#answer-error')`,'unknown accepts empty answer');
  await click('.answer-button');await until(`location.pathname.startsWith('/results/')`,'unknown results');
  assert.equal(await evaluate(`document.querySelectorAll('.result-row').length`),2);
  assert.ok(!(await evaluate(`document.querySelector('.result-list').textContent`)).includes('1974'));
  for(const event of [byLine(203),byLine(4)]){
    await seedStudy([event.id],'century-feedback-'+event.id,'century');
    assert.equal(await evaluate(`document.querySelector('#year-answer').maxLength`),2);
    await type('#year-answer','123');
    assert.equal(await evaluate(`document.querySelector('#year-answer').value`),'12');
    await input('#year-answer','１２３');
    assert.equal(await evaluate(`document.querySelector('#year-answer').value`),'12');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.at(-1).input`),'12');
    await click('.answer-button');
    await until(`document.querySelector('.feedback-status')?.textContent==='不正解'`,'century wrong feedback');
    const centuryText=(event.era==='BCE'?'紀元前':'')+Math.ceil(event.year/100)+'世紀';
    const yearText=(event.era==='BCE'?'紀元前':'')+event.year+'年';
    assert.equal(await evaluate(`document.querySelector('.correct-year').textContent`),centuryText);
    assert.equal(await evaluate(`document.querySelector('.correct-date strong').textContent`),yearText);
    assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.correct-year')).fontSize)>parseFloat(getComputedStyle(document.querySelector('.correct-date strong')).fontSize)`));
    if(event.era==='CE'&&process.env.HISTORY_SCREENSHOT!=='0'){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('/private/tmp/oboeyo-century-feedback.png',Buffer.from(shot.data,'base64'));}
    await click('.answer-button');await until(`location.pathname.startsWith('/results/')`,'century result');
    assert.equal(await evaluate(`document.querySelector('.result-row .date-text').textContent`),centuryText);
    assert.equal(await evaluate(`document.querySelector('.result-actual-year').textContent`),yearText);
    assert.ok(Number(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.result-answer .priority-stars')).fontSize)`))>=20);
  }
  // The input and action positions remain fixed for short/long prompts and feedback.
  await seedStudy([byLine(8).id,plain.id],'quiz-layout-test');
  const longestPrompt=[...events].sort((a,b)=>b.name.length-a.name.length)[0];
  const settle=()=>evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const setLayoutQuestion=async(event)=>{
    await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));const q=s.sessions.find(v=>v.id==='quiz-layout-test');Object.assign(q,{eventIds:${JSON.stringify([event.id,plain.id])},index:0,answers:[],input:'',stage:'active'});localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
    await call('Page.reload');await until(`!!document.querySelector('#year-answer')`,'layout question');await settle();
  };
  const layoutGeometry=()=>evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {input:rect('.answer-composer'),actions:rect('.answer-actions'),region:rect('.question-region'),title:rect('.question-title'),height:visualViewport.height,width:innerWidth,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,scrollY}})()`);
  for(const [width,height] of [[390,844],[320,568],[844,390],[390,360],[1280,800]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await setLayoutQuestion(byLine(8));const short=await layoutGeometry();
    await setLayoutQuestion(longestPrompt);const long=await layoutGeometry();
    for(const g of [short,long]){
      assert.ok(g.scrollHeight<=height+1&&g.scrollWidth<=width+1,JSON.stringify(g));
      assert.equal(g.scrollY,0);assert.ok(g.actions.bottom<=g.height+1&&g.actions.top>=0,JSON.stringify(g));
      assert.ok(g.title.top>=g.region.top-1&&g.title.bottom<=g.region.bottom+1,JSON.stringify(g));
    }
    assert.ok(Math.abs(short.input.top-long.input.top)<1&&Math.abs(short.actions.top-long.actions.top)<1,`stable positions at ${width}x${height}`);
    await click('.answer-button');await until(`!!document.querySelector('#answer-error')`,'layout error state');await settle();
    const errorFrame=await layoutGeometry();assert.ok(Math.abs(errorFrame.input.top-long.input.top)<1&&Math.abs(errorFrame.actions.top-long.actions.top)<1);
    await setLayoutQuestion(richHintEvent);const hintBefore=await layoutGeometry();
    await click('.hint-button');await until(`document.querySelectorAll('.question-hint li').length===3`,'layout hints');await settle();
    const hintAfter=await layoutGeometry();
    assert.ok(hintAfter.scrollHeight<=height+1&&hintAfter.scrollWidth<=width+1,JSON.stringify(hintAfter));
    assert.ok(Math.abs(hintAfter.input.top-hintBefore.input.top)<1&&Math.abs(hintAfter.actions.top-hintBefore.actions.top)<1,`stable hints at ${width}x${height}`);
    let hintPages=0;
    while(await evaluate(`!!document.querySelector('button[aria-label="ヒントの次のページ"]:not(:disabled)')`)){
      assert.ok(++hintPages<40,'finite hint pages');await click('button[aria-label="ヒントの次のページ"]');await settle();
    }
    assert.equal(await evaluate(`(()=>{const view=document.querySelector('.feedback-viewport').getBoundingClientRect(),content=document.querySelector('.feedback-content').getBoundingClientRect();return content.bottom<=view.bottom+1})()`),true,'all hints readable without scrolling');
    await setLayoutQuestion(noted);const noteBefore=await layoutGeometry();
    await click('.unknown-button');await until(`!!document.querySelector('.feedback')`,'layout feedback');await settle();
    const noteAfter=await layoutGeometry();
    assert.ok(noteAfter.scrollHeight<=height+1&&noteAfter.scrollWidth<=width+1,JSON.stringify(noteAfter));
    assert.ok(Math.abs(noteAfter.input.top-noteBefore.input.top)<1&&Math.abs(noteAfter.actions.top-noteBefore.actions.top)<1,`stable feedback at ${width}x${height}`);
    let pages=0;
    while(await evaluate(`!!document.querySelector('.feedback-pagination button:last-child:not(:disabled)')`)){
      assert.ok(++pages<40,'finite feedback pages');await click('.feedback-pagination button:last-child');await settle();
    }
    assert.equal(await evaluate(`(()=>{const view=document.querySelector('.feedback-viewport').getBoundingClientRect(),content=document.querySelector('.feedback-content').getBoundingClientRect();return content.bottom<=view.bottom+1})()`),true,'last line of long note is visible');
    assert.equal(await evaluate(`document.querySelector('.event-note p').textContent`),noted.note);
  }
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/');await until(`!!document.querySelector('.start-button:not(:disabled)')`,'mobile home');
  assert.equal(await evaluate(`document.body.innerText.includes('つづきから')`),false);
  assert.ok(Number(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.priority-options .priority-stars')).fontSize)`))>=20);
  assert.ok(Number(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.priority-shortcuts button')).fontSize)`))<16);
  if(process.env.HISTORY_SCREENSHOT!=='0'){await evaluate(`document.querySelector('.priority-field').scrollIntoView({block:'center'})`);const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('/private/tmp/oboeyo-mobile-stars.png',Buffer.from(shot.data,'base64'));}
  await click('.home-page .mode-option:first-child');
  await click('.scope-picker');await until(`!!document.querySelector('.settings-modal[open]')`,'mobile scope');
  await labelClick('単元から選択');await textClick('選択を解除');
  await input('input[aria-label="単元名で検索"]','アメリカ独立革命');
  await until(`!!document.querySelector('[data-group-id="W14"] .unit-children input')`,'mobile keyboard study area');
  await click('[data-group-id="W14"] .unit-children input');await click('.settings-modal .modal-footer button');
  await until(`!document.querySelector('dialog[open]')&&!location.hash`,'mobile scope selected');
  assert.equal(await evaluate(`matchMedia('(pointer: coarse)').matches`),true);
  await evaluate(`(()=>{window.studyFocusTrace=[];window.document.addEventListener('focusin',e=>window.studyFocusTrace.push({id:e.target.id,bridge:e.target.dataset.studyKeyboardBridge==='true',active:navigator.userActivation.isActive}),true);})()`);
  const trustedClick=async selector=>{
    const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  };
  await trustedClick('.start-button');await until(`location.pathname.startsWith('/study/')&&document.activeElement===document.querySelector('#year-answer')`,'mobile focus handoff');
  assert.ok(await evaluate(`window.studyFocusTrace.some(e=>e.bridge&&e.active)`),'keyboard prepared during trusted start gesture');
  assert.equal(await evaluate(`!!document.querySelector('[data-study-keyboard-bridge]')`),false);
  const mobileSession=await evaluate(`JSON.parse(localStorage.getItem('history-dates:v2')).sessions.at(-1)`);
  const mobileEvent=events.find(e=>e.id===mobileSession.eventIds[0]);
  await type('#year-answer',String(mobileEvent.year));await trustedClick('.answer-button');
  await until(`document.querySelector('.feedback-status')?.textContent==='正解'`,'mobile correct answer');
  assert.equal(await evaluate(`document.activeElement===document.querySelector('#year-answer')&&!document.querySelector('#year-answer').readOnly`),true,'keyboard input retained during automatic feedback');
  await until(`document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='2/3'`,'mobile automatic next',4000);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('#year-answer')`),true);
  await trustedClick('.unknown-button');await until(`document.querySelector('.feedback-status')?.textContent==='わからない'`,'mobile unknown');
  await trustedClick('.answer-button');await until(`document.querySelector('.progress-text')?.textContent.replaceAll(' ','')==='3/3'`,'mobile manual next');
  assert.equal(await evaluate(`document.activeElement===document.querySelector('#year-answer')&&!document.querySelector('#year-answer').readOnly`),true);
  assert.ok(await evaluate(`window.studyFocusTrace.some(e=>e.id==='year-answer'&&e.active)`),'next question focused during user gesture');
  console.log('Headless smoke passed: century-first feedback/results for CE and BCE, larger mobile priority stars with unchanged shortcuts, no resume link, keyboard focus preparation/retention and manual/automatic next, plus fixed layout and existing study flows.');
  await call('Browser.close');
 }finally{socket?.close();chrome.kill();await delay(200);await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
