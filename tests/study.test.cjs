/* eslint-disable @typescript-eslint/no-require-imports -- These tests run directly in Node.js as CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const study = require('../lib/study.ts');
const { DEFAULT_SETTINGS, answerParts, expectedAnswer, checkAnswer, filterEvents, makeQueue, recordAttempt, weakness, rangeError, regionRange, selectRegion, selectSubject, submitSession, advanceSession, shuffled } = study;
const { decodeStore, restoreSettings } = require('../lib/storage.ts');
const { events, validateEvents, matchesSubject } = require('../lib/events.ts');
const { unitGroups, units } = require('../data/units.ts');
const { regions } = require('../data/regions.ts');
const sample = { ...events.find(e => e.id === 'jp-1889'), year: 645 }, bce = events.find(e => e.id === 'wh-b221');
const settings = (extra = {}) => ({ ...structuredClone(DEFAULT_SETTINGS), ...extra });
const attempt = (correct, mode = 'exact', at = '2026-10-30T12:00:00.000Z') => ({ eventId: sample.id, mode, correct, input: '645', era: 'CE', at });
const baseStore = () => ({ version: 2, settings: settings(), history: {}, recent: [], presets: [], sessions: [] });
const session = (extra = {}) => ({ id: 'test-session', eventIds: [sample.id,bce.id], settings: settings(), index: 0, answers: [], input: '645', era: 'CE', stage: 'active', createdAt: '2026-10-31T00:00:00Z', completedAt: null, ...extra });

test('same-year hints randomly select up to three other exact events across subjects, respecting the era', () => {
  const question={...sample,id:'question',year:1905,era:'CE'};
  const matches=Array.from({length:6},(_,i)=>({...question,id:'match-'+i,subject:i%2?'japan':'world'}));
  const pool=[question,...matches,{...question,id:'other-era',era:'BCE'},{...question,id:'other-year',year:1906},{...question,id:'range',dateType:'range',endYear:1910},{...question,id:'approximate',dateType:'approximate'}];
  const originalIds=pool.map(e=>e.id);
  const hints=study.sameYearHints(pool,question,()=>0);
  assert.equal(hints.length,3);
  assert.equal(new Set(hints.map(e=>e.id)).size,3);
  assert.ok(hints.every(e=>matches.includes(e)));
  assert.notDeepEqual(hints,study.sameYearHints(pool,question,()=>.999));
  assert.deepEqual(pool.map(e=>e.id),originalIds);
  for(const count of [0,1,2,3]){
    const available=matches.slice(0,count);
    assert.deepEqual(new Set(study.sameYearHints([question,...available],question).map(e=>e.id)),new Set(available.map(e=>e.id)));
  }
  const bceQuestion={...question,era:'BCE'};
  assert.deepEqual(study.sameYearHints(pool,bceQuestion).map(e=>e.id),['other-era']);
});

test('all 34 groups and supplied major study areas have stable unique IDs', () => {
  assert.equal(unitGroups.filter(g=>g.subject==='world').length,21);
  assert.equal(unitGroups.filter(g=>g.subject==='japan').length,13);
  assert.equal(new Set(units.map(u=>u.id)).size,units.length);
  for(const name of ['西ヨーロッパ世界の誕生','十字軍と中世ヨーロッパ','宋と周辺諸国','フランス革命','ナポレオンの支配と戦争']) assert.ok(units.some(u=>u.name===name));
  assert.equal(regions.length,11);
  for(const r of regions) for(const [i,p] of r.periods.entries()) { assert.equal(p.order,i); assert.ok(p.start<=p.end);assert.notEqual(p.start,0);assert.notEqual(p.end,0); }
});
test('unit selections union, respect subject, and never duplicate related events', () => {
  const s=settings({scopeMethod:'units',unitIds:['J02-02','W07-03','W06-03']});
  const pool=[{...sample,unitId:'J02-02'},{...sample,id:'second',unitId:'J02-02'},events.find(e=>e.id==='wh-1258')];
  const result=filterEvents(pool,s,{});
  assert.deepEqual(new Set(result.map(e=>e.id)),new Set([sample.id,'second','wh-1258']));
  assert.equal(filterEvents([...pool,...pool],s,{}).length,result.length);
  assert.deepEqual(filterEvents(pool,{...s,subject:'japan'},{}).map(e=>e.id),[sample.id,'second']);
  assert.equal(filterEvents(events,settings({scopeMethod:'units'}),{}).length,0);
  assert.ok(rangeError(settings({scopeMethod:'units'})));
});
test('region ranges use regional tags and dates, independently of unit membership', () => {
  const china=settings({scopeMethod:'region',regionId:'china',startPeriodId:'china-05',endPeriodId:'china-06'});
  assert.deepEqual([regionRange(china).from,regionRange(china).to],[618,1279]);
  assert.ok(filterEvents(events,china,{}).some(e=>e.name.includes('澶淵の盟'))); // A draft event inside the selected period.
  const synthetic={...sample,id:'synthetic-1127',subject:'world',unitId:'W14-03',regions:['china'],year:1127};
  assert.equal(filterEvents([synthetic],china,{}).length,1);
  assert.equal(filterEvents([{...synthetic,regions:['west-asia']}],china,{}).length,0);
  const europe=settings({scopeMethod:'region',regionId:'europe',startPeriodId:'europe-05',endPeriodId:'europe-06'});
  assert.ok(filterEvents(events,europe,{}).some(e=>e.year===1648));
  assert.ok(regions.find(r=>r.id==='china').periods.some(p=>p.name==='五代・宋'));
  assert.ok(regions.find(r=>r.id==='japan').periods.some(p=>p.name==='江戸中期'));
  assert.equal(filterEvents([{...synthetic,year:1271}],{...china,startPeriodId:'china-07',endPeriodId:'china-07'},{}).length,1);
  const muromachi=settings({scopeMethod:'region',regionId:'japan',startPeriodId:'japan-09',endPeriodId:'japan-09'});
  assert.equal(filterEvents([{...sample,year:1467,regions:['japan']}],muromachi,{}).length,1);
  assert.equal(filterEvents(events,{...china,startPeriodId:'china-06',endPeriodId:'china-05'},{}).length,0);
  assert.ok(filterEvents(events,settings({scopeMethod:'region',regionId:'oceania',startPeriodId:'oceania-01',endPeriodId:'oceania-05'}),{}).some(e=>e.year===1770));
});
test('subject and region changes keep region ranges valid', () => {
  const changed=selectSubject(settings(),'world');assert.equal(changed.regionId,'china');assert.ok(regionRange(changed));
  const japan=selectSubject(changed,'japan');assert.equal(japan.regionId,'japan');
  const europe=selectRegion(settings(),'europe');assert.equal(europe.startPeriodId,'europe-01');assert.equal(europe.endPeriodId,'europe-10');
});
test('three methods are exclusive and priorities work with each method', () => {
  const lingering=settings({scopeMethod:'random',subject:'world',unitIds:['J02-02'],regionId:'japan',startPeriodId:'bad',endPeriodId:'bad',priorities:[5]});
  const all=filterEvents(events,lingering,{});assert.ok(all.length>0);assert.ok(all.every(e=>matchesSubject(e,'world')&&e.priority===5));
  for(const s of [settings({scopeMethod:'units',unitIds:units.map(u=>u.id),priorities:[3,5]}), settings({scopeMethod:'region',regionId:'europe',startPeriodId:'europe-01',endPeriodId:'europe-10',priorities:[3,5]})]) assert.ok(filterEvents(events,s,{}).every(e=>[3,5].includes(e.priority)));
});
test('full-range shuffle is uniform and ignores saved order, balancing and priority weights', () => {
  const items=[{...sample,id:'a',priority:1},{...bce,id:'b',priority:5},{...sample,id:'c',priority:3}];
  const permutations=new Set(),first={a:0,b:0,c:0};
  for(let j=0;j<3;j++)for(let k=0;k<2;k++){
    const randoms=[(j+.1)/3,(k+.1)/2];let i=0;
    const result=makeQueue(items,settings({count:'all',order:'oldest',balanced:true}),{},()=>randoms[i++]);
    permutations.add(result.map(e=>e.id).join(''));first[result[0].id]++;
  }
  assert.equal(permutations.size,6);assert.deepEqual(first,{a:2,b:2,c:2});
  assert.deepEqual(shuffled(items,()=>.5),makeQueue(items,settings({count:'all',balanced:true,order:'weak'}),{a:recordAttempt(undefined,attempt(false))},()=>.5));
});
test('unseen priority precedes answered questions across scopes, orders and balancing', () => {
  const items=Array.from({length:12},(_,i)=>({...(i%2?bce:sample),id:`q${i}`,year:1000+i,era:'CE'}));
  const history=Object.fromEntries(items.slice(0,8).map(e=>[e.id,recordAttempt(undefined,attempt(false))]));
  for(const scopeMethod of ['random','units','region'])for(const order of ['random','oldest','newest','weak'])for(const balanced of [false,true]){
    const s=settings({scopeMethod,order,balanced,count:10,prioritizeUnseen:true});
    const queue=makeQueue([...items,...items],s,history,()=>.99);
    assert.equal(queue.length,10);assert.equal(new Set(queue.map(e=>e.id)).size,10);
    assert.ok(queue.slice(0,4).every(e=>!history[e.id]?.attempts),`${scopeMethod}/${order}/${balanced}`);
    assert.ok(queue.slice(4).every(e=>history[e.id]?.attempts));
  }
  const s=settings({count:10,prioritizeUnseen:true});
  assert.equal(makeQueue(items,{...s,prioritizeUnseen:false},history,()=>.99)[0].id,'q0');
  assert.deepEqual(makeQueue(items,s,{},()=>.99),makeQueue(items,{...s,prioritizeUnseen:false},{},()=>.99));
  const allSeen=Object.fromEntries(items.map(e=>[e.id,recordAttempt(undefined,attempt(true))]));
  assert.deepEqual(makeQueue(items,s,allSeen,()=>.99),makeQueue(items,{...s,prioritizeUnseen:false},allSeen,()=>.99));
  const unseenWorld=items.map(e=>({...bce,id:`new-${e.id}`}));
  const balanced=makeQueue([...items,...unseenWorld],{...s,scopeMethod:'units',balanced:true},allSeen,()=>.99);
  assert.equal(balanced.length,10);assert.ok(balanced.every(e=>e.id.startsWith('new-')));
});
test('unseen priority defaults off and restores saved and legacy preferences', () => {
  assert.equal(restoreSettings({}).prioritizeUnseen,false);
  assert.equal(restoreSettings({prioritizeUnseen:true}).prioritizeUnseen,true);
  assert.equal(restoreSettings({prioritizeUnseen:'true'}).prioritizeUnseen,false);
  const legacy=restoreSettings({order:'unseen'});
  assert.equal(legacy.prioritizeUnseen,true);assert.equal(legacy.order,'random');
});
test('weak priority works across scopes, fills from other questions and follows unseen priority', () => {
  const items=Array.from({length:12},(_,i)=>({...(i%2?bce:sample),id:`weak-${i}`,year:1000+i,era:'CE'}));
  const history=Object.fromEntries(items.slice(0,8).map((e,i)=>[e.id,recordAttempt(undefined,attempt(i>=4))]));
  for(const scopeMethod of ['random','units','region'])for(const balanced of [false,true]){
    for(const prioritizeUnseen of [false,true]){
      const queue=makeQueue(items,settings({scopeMethod,balanced,count:10,prioritizeWeak:true,prioritizeUnseen}),history,()=>.99);
      assert.equal(queue.length,10);assert.equal(new Set(queue.map(e=>e.id)).size,10);
      const offset=prioritizeUnseen?4:0;
      if(prioritizeUnseen)assert.ok(queue.slice(0,4).every(e=>!history[e.id]));
      assert.ok(queue.slice(offset,offset+4).every(e=>weakness(history[e.id])>0));
      assert.ok(queue.slice(offset+4).every(e=>weakness(history[e.id])===0));
    }
  }
  const noWeak=Object.fromEntries(items.map(e=>[e.id,recordAttempt(undefined,attempt(true))]));
  assert.deepEqual(makeQueue(items,settings({prioritizeWeak:true}),noWeak,()=>.99),makeQueue(items,settings(),noWeak,()=>.99));
});
test('old status filters migrate to priority flags without hiding other questions', () => {
  for(const status of ['wrong','recent','weak','review']){
    const restored=restoreSettings({statuses:[status]});
    assert.equal(restored.prioritizeWeak,true);assert.deepEqual(restored.statuses,[]);
  }
  assert.equal(restoreSettings({statuses:['new']}).prioritizeUnseen,true);
  assert.equal(restoreSettings({order:'weak'}).prioritizeWeak,true);
  assert.equal(restoreSettings({order:'weak'}).order,'random');
  assert.equal(restoreSettings({}).prioritizeWeak,false);
  assert.equal(restoreSettings({prioritizeWeak:'true'}).prioritizeWeak,false);
  assert.equal(restoreSettings({prioritizeWeak:true}).prioritizeWeak,true);
});
test('all modes compose suffixes correctly, including short years and BCE', () => {
  const e={...sample,year:1648};
  for(const [mode,answer,suffix] of [['exact',1648,''],['decade',164,'8'],['hundred',16,'48'],['century',17,'']]){
    assert.equal(expectedAnswer(e,mode),answer);assert.equal(answerParts(e,mode).suffix,suffix);
    assert.equal(checkAnswer(e,mode,String(answer),'CE'),true);assert.equal(checkAnswer(e,mode,String(answer),'BCE'),false);
  }
  assert.deepEqual(answerParts(sample,'hundred'),{prefix:'6',suffix:'45',inputDigits:1});
  assert.equal(expectedAnswer({...sample,year:57},'hundred'),5);
  assert.equal(expectedAnswer({...sample,year:9},'hundred'),9);
  for(const [mode,value] of [['exact',221],['decade',22],['hundred',2],['century',3]]) assert.equal(checkAnswer(bce,mode,String(value),'BCE'),true);
  assert.equal(checkAnswer(sample,'exact','６４５','CE'),true);
  for(const input of ['','0','-645','6.45','abc'])assert.equal(checkAnswer(sample,'exact',input,'CE'),false);
  assert.equal(study.formatSubmittedAnswer(e,'hundred','16','CE'),'1648年');
});
test('century boundaries have no year zero in either era', () => {
  for(const era of ['CE','BCE'])for(const [year,c] of [[1,1],[100,1],[101,2],[200,2],[201,3],[1900,19],[1901,20],[2000,20],[2001,21]]) assert.equal(checkAnswer({...sample,year,era},'century',String(c),era),true);
  assert.throws(()=>validateEvents([{...sample,year:0}]));
});
test('learning history, review and error filters are shared across every mode', () => {
  let h=recordAttempt(undefined,attempt(false,'exact'));
  const history={[sample.id]:h};
  for(const mode of Object.keys(study.MODES)){
    assert.equal(filterEvents([sample],settings({mode,statuses:['review']}),history).length,1);
    assert.equal(filterEvents([sample],settings({mode,statuses:['new']}),history).length,0);
    assert.equal(filterEvents([sample],settings({mode,statuses:['wrong']}),history).length,1);
  }
  h=recordAttempt(h,attempt(true,'century'));assert.equal(h.streak,1);assert.equal(h.review,true);
  h=recordAttempt(h,attempt(true,'hundred'));assert.equal(h.review,false);assert.equal(h.streak,2);
  assert.equal(h.attempts,3);assert.equal(h.correct,2);assert.equal(h.incorrect,1);assert.equal(h.lastCorrect,true);assert.equal(h.modes,undefined);assert.equal(weakness(h),0);
});
test('recent errors use shared records', () => {
  const h=recordAttempt(undefined,attempt(false));
  assert.equal(filterEvents([sample],settings({mode:'century',statuses:['recent']}),{[sample.id]:h},Date.parse('2026-10-31')).length,1);
  assert.equal(filterEvents([sample],settings({statuses:['recent']}),{[sample.id]:h},Date.parse('2026-11-10')).length,0);
});
test('non-random ordering and short sessions still work without duplication', () => {
  const s=settings({scopeMethod:'units',unitIds:units.map(u=>u.id),count:'all',order:'oldest'});
  const q=makeQueue(events,s,{});assert.equal(study.chronologicalYear(q[0]),-770);
  for(const count of [10,20,50,'all']){
    const queue=makeQueue([...events,...events],settings({count}),{});assert.equal(queue.length,count==='all'?events.length:Math.min(count,events.length));assert.equal(new Set(queue.map(e=>e.id)).size,queue.length);
  }
  assert.equal(makeQueue([sample],settings(),{}).length,1);assert.equal(makeQueue([],settings(),{}).length,0);
});
test('persisted sessions make submission and manual/timed advancing idempotent', () => {
  let store={...baseStore(),sessions:[session()]};
  store=submitSession(store,'test-session',0,sample,'2026-10-31T00:00:01Z');
  assert.equal(store.history[sample.id].attempts,1);assert.equal(store.sessions[0].answers.length,1);
  assert.equal(submitSession(store,'test-session',0,sample),store);
  const first=advanceSession(store,'test-session',0);assert.equal(first.sessions[0].index,1);assert.equal(first.sessions[0].input,'');assert.equal(first.sessions[0].era,'CE');
  assert.equal(advanceSession(first,'test-session',0),first);
  assert.equal(advanceSession(first,'test-session',1),first); // No answer: cannot skip.
  store={...first,sessions:[{...first.sessions[0],input:'221',era:'BCE'}]};
  store=submitSession(store,'test-session',1,bce);
  store=advanceSession(store,'test-session',1);assert.equal(store.sessions[0].stage,'finished');
  assert.equal(advanceSession(store,'test-session',1),store);
});
test('unknown answers record one incorrect attempt, persist and become review targets in every mode', () => {
  for(const mode of ['exact','decade','hundred','century'])for(const event of [sample,bce]){
    const current=session({eventIds:[event.id,sample.id===event.id?bce.id:sample.id],settings:settings({mode}),input:''});
    const initial={...baseStore(),sessions:[current]};
    assert.equal(submitSession(initial,current.id,0,event),initial);
    const saved=submitSession(initial,current.id,0,event,'2026-11-03T00:00:00Z',true);
    const answer=saved.sessions[0].answers[0];
    assert.equal(answer.unknown,true);assert.equal(answer.correct,false);assert.equal(answer.input,'');
    assert.equal(saved.history[event.id].attempts,1);assert.equal(saved.history[event.id].incorrect,1);
    assert.equal(saved.history[event.id].streak,0);assert.equal(saved.history[event.id].review,true);
    assert.equal(filterEvents([event],settings({statuses:['new']}),saved.history).length,0);
    assert.equal(filterEvents([event],settings({statuses:['review']}),saved.history).length,1);
    assert.deepEqual(decodeStore(JSON.stringify(saved)),saved);
    assert.equal(study.formatSubmittedAnswer(event,mode,answer.input,answer.era),'わからない');
    assert.equal(submitSession(saved,current.id,0,event,'2026-11-03T00:00:01Z',true),saved);
    assert.equal(submitSession(saved,current.id,0,event),saved);
    const next=advanceSession(saved,current.id,0);
    assert.equal(next.sessions[0].index,1);assert.equal(next.history[event.id].attempts,1);
  }
});
test('unknown answers discard a partial guess and cannot be forged as correct', () => {
  for(const input of ['645','abc']){
    const store={...baseStore(),sessions:[session({input})]};
    const saved=submitSession(store,'test-session',0,sample,'2026-11-03T00:00:00Z',true);
    assert.equal(saved.sessions[0].input,'');assert.equal(saved.sessions[0].answers[0].input,'');
    assert.equal(saved.sessions[0].answers[0].correct,false);
    const answer=saved.recent[0];
    assert.equal(decodeStore(JSON.stringify({...baseStore(),recent:[{...answer,correct:true}]})).recent.length,0);
    assert.equal(decodeStore(JSON.stringify({...baseStore(),recent:[{...answer,unknown:'yes'}]})).recent.length,0);
  }
});
test('old aggregate histories migrate without double-counting and discard removed favorite flags', () => {
  const old={...recordAttempt(undefined,attempt(false)),favorite:true,modes:{exact:{attempts:1,correct:0,incorrect:1,streak:0,lastAt:attempt(false).at,recent:[attempt(false)]}}};
  const migrated=decodeStore(JSON.stringify({version:1,settings:{subject:'japan',mode:'century',units:['律令国家の形成'],count:20},history:{[sample.id]:old},recent:[attempt(false)],presets:[{id:'p',name:'古代',settings:{units:['律令国家の形成']}}]}));
  assert.equal(migrated.version,2);assert.equal(migrated.history[sample.id].attempts,1);assert.equal(migrated.history[sample.id].favorite,undefined);assert.equal(migrated.history[sample.id].review,true);assert.equal(migrated.history[sample.id].modes,undefined);
  assert.equal(migrated.settings.mode,'century');assert.equal(migrated.settings.count,20);assert.equal(migrated.settings.scopeMethod,'units');assert.ok(migrated.settings.unitIds.includes('J02-02'));assert.ok(migrated.presets[0].settings.unitIds.length);
});
test('settings, sessions, input, era, results and presets survive JSON round trips', () => {
  const s=settings({scopeMethod:'units',unitIds:['J02-02'],priorities:[3,5],prioritizeUnseen:true,prioritizeWeak:true});
  const store={...baseStore(),settings:s,history:{[sample.id]:recordAttempt(undefined,attempt(false))},sessions:[session({input:'64',era:'BCE'})],presets:[{id:'p',name:'任意',settings:s}]};
  assert.deepEqual(decodeStore(JSON.stringify(store)),store);
  assert.deepEqual(restoreSettings({statuses:['favorite','review']}).statuses,[]);
  assert.equal(restoreSettings({statuses:['review']}).prioritizeWeak,true);
  assert.deepEqual(restoreSettings({statuses:['favorite']}).statuses,[]);
  assert.throws(()=>decodeStore('{bad'));assert.throws(()=>decodeStore('{"version":99}'));
  assert.equal(restoreSettings({mode:'bad',subject:'bad',priorities:[0,6]}).mode,'exact');
  assert.equal(decodeStore(JSON.stringify({...baseStore(),sessions:[session({index:99})]})).sessions.length,0);
});
test('draft data uses valid independent unit, region, priority and date attributes', () => {
  assert.equal(events.filter(e=>e.draftLines).length,547);assert.equal(new Set(events.map(e=>e.id)).size,events.length);
  for(const id of ['jp-1889','wh-1648','wh-1492']) assert.ok(events.find(e=>e.id===id).priority>=4);
  assert.throws(()=>validateEvents([{...sample,priority:6}]));assert.throws(()=>validateEvents([{...sample,unitId:'W04-02'}]));
  assert.equal(filterEvents([{...sample,dateType:'range'},{...bce,dateType:'approximate'}],settings(),{}).length,0);
});


test('every supplied draft entry retains its year, era and right-hand notes', () => {
  const lines=fs.readFileSync(require('node:path').join(__dirname,'../data/sources/events-draft.txt'),'utf8').split('\n');
  const covered=new Set();
  for(const event of events.filter(e=>e.draftLines)){
    assert.equal(event.source,'draft');
    for(const lineNumber of event.draftLines){
      assert.ok(!covered.has(lineNumber),`duplicate draft line ${lineNumber}`);covered.add(lineNumber);
      const line=lines[lineNumber-1].trim();
      let year,era='CE',note;
      if(line==='東遊運動')year=1905;
      else {
        const front=line.match(/^(前|後)?(\d+)年?[　\s]+(.+)$/);
        const after=front?null:line.match(/^(.*?)[　]+(前|後)?(\d+)年?(?:[　]+(.*))?$/);
        const fallback=front||after?null:line.match(/^(.*?)(前|後)?(\d+)年?$/);
        if(front){year=Number(front[2]);era=front[1]==='前'?'BCE':'CE';}
        else {const match=after||fallback;assert.ok(match,`parse line ${lineNumber}`);year=Number(match[3]);era=match[2]==='前'?'BCE':'CE';note=match[4]?.trim();}
      }
      assert.equal(event.year,year,`year on draft line ${lineNumber}`);
      assert.equal(event.era,era,`era on draft line ${lineNumber}`);
      if(note)assert.ok(event.note?.includes(note),`note on draft line ${lineNumber}`);
    }
  }
  assert.equal(covered.size,lines.filter(line=>line.trim()).length);
  assert.equal(events.filter(e=>e.draftLines&&e.note).length,23);
  assert.ok(!events.some(e=>e.id==='jp-645'||e.id==='wh-1517'));
  assert.ok(events.find(e=>e.name.includes('独立宣言')&&e.year===1776).name.includes('アメリカ'));
  assert.ok(events.find(e=>e.year===1417).name.includes('終了'));
});
test('draft-specific reduced digits apply to full-year answers', () => {
  const ottoman=events.find(e=>e.answerPrecision==='hundred');
  const independence=events.find(e=>e.answerPrecision==='decade');
  assert.deepEqual(answerParts(ottoman,'exact'),{prefix:'13',suffix:'00',inputDigits:2});
  assert.equal(checkAnswer(ottoman,'exact','13','CE'),true);
  assert.equal(checkAnswer(ottoman,'decade','13','CE'),true);
  assert.equal(checkAnswer(ottoman,'hundred','13','CE'),true);
  assert.equal(checkAnswer(ottoman,'exact','1300','CE'),false);
  assert.equal(checkAnswer(independence,'exact','182','CE'),true);
  assert.equal(checkAnswer(independence,'hundred','18','CE'),true);
  assert.equal(checkAnswer(independence,'century','19','CE'),true);
  assert.equal(study.formatSubmittedAnswer(independence,'exact','182','CE'),'1820年');
  assert.throws(()=>validateEvents([{...sample,note:42}]));
  assert.throws(()=>validateEvents([{...sample,answerPrecision:'invalid'}]));
});
