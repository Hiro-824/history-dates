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
  let seq=0;const pending=new Map();
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result);}}});
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
  const modalGeometry=await evaluate(`(()=>{const dialog=document.querySelector('.settings-modal'),body=dialog.querySelector('.modal-body'),footer=dialog.querySelector('.modal-footer').getBoundingClientRect();return {width:document.documentElement.scrollWidth,viewport:innerWidth,footerBottom:footer.bottom,height:innerHeight,scrollable:body.scrollHeight>body.clientHeight,locked:document.body.style.overflow==='hidden'}})()`);
  assert.equal(modalGeometry.width,modalGeometry.viewport);assert.ok(modalGeometry.footerBottom<=modalGeometry.height);assert.equal(modalGeometry.locked,true);
  await click('.settings-modal .modal-header button');
  await until(`location.pathname==='/'&&!location.hash&&!document.querySelector('dialog[open]')&&document.body.style.overflow!=='hidden'`,'close direct modal without leaving home');
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
  await until(`location.pathname.startsWith('/study/')&&!!document.querySelector('#year-answer')&&!document.querySelector('dialog[open]')&&document.body.style.overflow!=='hidden'`,'study route closes modal');
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
  await traverse(1);await until(`location.pathname===${JSON.stringify(resultsPath)}&&!!document.querySelector('.result-actions')&&!document.querySelector('dialog[open]')&&document.body.style.overflow!=='hidden'`,'forward results without modal');
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
  const seedStudy=async(eventIds,id)=>{
   await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('history-dates:v2'));s.sessions.push({id:${JSON.stringify(id)},eventIds:${JSON.stringify(eventIds)},settings:{...s.settings,mode:'exact'},index:0,answers:[],input:'',era:'CE',stage:'active',createdAt:new Date().toISOString(),completedAt:null});localStorage.setItem('history-dates:v2',JSON.stringify(s));})()`);
   await navigate('/study/'+id);await until(`!!document.querySelector('#year-answer')`,'seeded question');
  };
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
  assert.equal(await evaluate(`!!document.querySelector('dialog .source-link')`),false);
  await click('dialog .modal-header button');
  for(const [line,prefix,suffix] of [[175,'13','00'],[232,'182','0']]){
   await seedStudy([byLine(line).id],'draft-precision-'+line);
   assert.equal(await evaluate(`!!document.querySelector('.answer-label,.question-heading')`),false);
   assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'?');
   assert.equal(await evaluate(`document.querySelector('#year-answer').maxLength`),6);
   assert.ok(!(await evaluate(`document.querySelector('.question-title').textContent`)).includes('上2桁'));
   assert.equal(await evaluate(`document.querySelector('.fixed-digits').textContent`),suffix);
   await type('#year-answer',prefix);await click('.answer-button');
   await until(`document.querySelector('.feedback-status')?.textContent==='正解'`,'draft reduced-digit answer');
   await until(`location.pathname.startsWith('/results/')`,'reduced-digit completion',4000);
  }
  await seedStudy([byLine(19).id,byLine(203).id],'unknown-answer-test');
  assert.equal(await evaluate(`!!document.querySelector('.question-heading,.answer-label')`),false);
  assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'?');
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
  assert.equal(await evaluate(`document.querySelector('#year-answer').placeholder`),'?');
  assert.equal(await evaluate(`document.querySelector('#year-answer').style.width`),'1ch');
  await click('.answer-button');await until(`!!document.querySelector('#answer-error')`,'normal empty answer rejected');
  await click('.unknown-button');await until(`document.querySelector('.feedback-status')?.textContent==='わからない'&&!document.querySelector('#answer-error')`,'unknown accepts empty answer');
  await click('.answer-button');await until(`location.pathname.startsWith('/results/')`,'unknown results');
  assert.equal(await evaluate(`document.querySelectorAll('.result-row').length`),2);
  assert.ok(!(await evaluate(`document.querySelector('.result-list').textContent`)).includes('1974'));
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
    if(width===390&&height===844&&process.env.HISTORY_SCREENSHOT!=='0'){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('/private/tmp/oboeyo-fixed-quiz.png',Buffer.from(shot.data,'base64'));}
    await click('.answer-button');await until(`!!document.querySelector('#answer-error')`,'layout error state');await settle();
    const errorFrame=await layoutGeometry();assert.ok(Math.abs(errorFrame.input.top-long.input.top)<1&&Math.abs(errorFrame.actions.top-long.actions.top)<1);
    await setLayoutQuestion(noted);const noteBefore=await layoutGeometry();
    await click('.unknown-button');await until(`!!document.querySelector('.feedback')`,'layout feedback');await settle();
    const noteAfter=await layoutGeometry();
    assert.ok(noteAfter.scrollHeight<=height+1&&noteAfter.scrollWidth<=width+1,JSON.stringify(noteAfter));
    assert.ok(Math.abs(noteAfter.input.top-noteBefore.input.top)<1&&Math.abs(noteAfter.actions.top-noteBefore.actions.top)<1,`stable feedback at ${width}x${height}`);
    if(width===320&&process.env.HISTORY_SCREENSHOT!=='0'){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('/private/tmp/oboeyo-paged-feedback.png',Buffer.from(shot.data,'base64'));}
    let pages=0;
    while(await evaluate(`!!document.querySelector('.feedback-pagination button:last-child:not(:disabled)')`)){
      assert.ok(++pages<40,'finite feedback pages');await click('.feedback-pagination button:last-child');await settle();
    }
    assert.equal(await evaluate(`(()=>{const view=document.querySelector('.feedback-viewport').getBoundingClientRect(),content=document.querySelector('.feedback-content').getBoundingClientRect();return content.bottom<=view.bottom+1})()`),true,'last line of long note is visible');
    assert.equal(await evaluate(`document.querySelector('.event-note p').textContent`),noted.note);
  }
  console.log('Headless smoke passed: study flows, unknown answers, and fixed quiz layout at mobile, desktop, landscape and keyboard-sized viewports; long prompts fit and all feedback pages remain readable without page scrolling.');
  await call('Browser.close');
 }finally{socket?.close();chrome.kill();await delay(200);await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
