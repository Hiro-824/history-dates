/* eslint-disable @typescript-eslint/no-require-imports -- These tests run directly in Node.js as CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const study = require('../lib/study.ts');
const { DEFAULT_SETTINGS, answerParts, expectedAnswer, checkAnswer, filterEvents, makeQueue, recordAttempt, weakness, rangeError, regionRange, selectRegion, selectSubject, submitSession, advanceSession, shuffled } = study;
const { decodeStore, restoreSettings } = require('../lib/storage.ts');
const { events, validateEvents } = require('../lib/events.ts');
const { unitGroups, units } = require('../data/units.ts');
const { regions } = require('../data/regions.ts');
const sample = { ...events.find(e => e.id === 'jp-1889'), year: 645 }, bce = events.find(e => e.id === 'wh-b221');
const settings = (extra = {}) => ({ ...structuredClone(DEFAULT_SETTINGS), ...extra });
const attempt = (correct, mode = 'exact', at = '2026-10-30T12:00:00.000Z') => ({ eventId: sample.id, mode, correct, input: '645', era: 'CE', at });
const baseStore = () => ({ version: 2, settings: settings(), history: {}, recent: [], presets: [], sessions: [] });
const session = (extra = {}) => ({ id: 'test-session', eventIds: [sample.id,bce.id], settings: settings(), index: 0, answers: [], input: '645', era: 'CE', stage: 'active', createdAt: '2026-10-31T00:00:00Z', completedAt: null, ...extra });

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
  const all=filterEvents(events,lingering,{});assert.ok(all.length>0);assert.ok(all.every(e=>e.subject==='world'&&e.priority===5));
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
test('recent errors and favorites use shared records', () => {
  const h=recordAttempt(undefined,attempt(false));h.favorite=true;
  assert.equal(filterEvents([sample],settings({mode:'century',statuses:['recent']}),{[sample.id]:h},Date.parse('2026-10-31')).length,1);
  assert.equal(filterEvents([sample],settings({statuses:['recent']}),{[sample.id]:h},Date.parse('2026-11-10')).length,0);
  assert.equal(filterEvents([sample],settings({statuses:['favorite']}),{[sample.id]:h}).length,1);
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
test('old aggregate histories migrate without double-counting modes or losing favorites', () => {
  const old={...recordAttempt(undefined,attempt(false)),favorite:true,modes:{exact:{attempts:1,correct:0,incorrect:1,streak:0,lastAt:attempt(false).at,recent:[attempt(false)]}}};
  const migrated=decodeStore(JSON.stringify({version:1,settings:{subject:'japan',mode:'century',units:['律令国家の形成'],count:20},history:{[sample.id]:old},recent:[attempt(false)],presets:[{id:'p',name:'古代',settings:{units:['律令国家の形成']}}]}));
  assert.equal(migrated.version,2);assert.equal(migrated.history[sample.id].attempts,1);assert.equal(migrated.history[sample.id].favorite,true);assert.equal(migrated.history[sample.id].review,true);assert.equal(migrated.history[sample.id].modes,undefined);
  assert.equal(migrated.settings.mode,'century');assert.equal(migrated.settings.count,20);assert.equal(migrated.settings.scopeMethod,'units');assert.ok(migrated.settings.unitIds.includes('J02-02'));assert.ok(migrated.presets[0].settings.unitIds.length);
});
test('settings, sessions, input, era, results and presets survive JSON round trips', () => {
  const s=settings({scopeMethod:'units',unitIds:['J02-02'],priorities:[3,5]});
  const store={...baseStore(),settings:s,history:{[sample.id]:recordAttempt(undefined,attempt(false))},sessions:[session({input:'64',era:'BCE'})],presets:[{id:'p',name:'任意',settings:s}]};
  assert.deepEqual(decodeStore(JSON.stringify(store)),store);
  assert.throws(()=>decodeStore('{bad'));assert.throws(()=>decodeStore('{"version":99}'));
  assert.equal(restoreSettings({mode:'bad',subject:'bad',priorities:[0,6]}).mode,'exact');
  assert.equal(decodeStore(JSON.stringify({...baseStore(),sessions:[session({index:99})]})).sessions.length,0);
});
test('draft data uses valid independent unit, region, priority and date attributes', () => {
  assert.equal(events.length,546);assert.equal(new Set(events.map(e=>e.id)).size,events.length);
  for(const id of ['jp-1889','wh-1648','wh-1492']) assert.ok(events.find(e=>e.id===id).priority>=4);
  assert.throws(()=>validateEvents([{...sample,priority:6}]));assert.throws(()=>validateEvents([{...sample,unitId:'W04-02'}]));
  assert.equal(filterEvents([{...sample,dateType:'range'},{...bce,dateType:'approximate'}],settings(),{}).length,0);
});


test('every supplied draft entry retains its year, era and right-hand notes', () => {
  const lines=fs.readFileSync(require('node:path').join(__dirname,'../data/sources/events-draft.txt'),'utf8').split('\n');
  const covered=new Set();
  for(const event of events){
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
  assert.equal(events.filter(e=>e.note).length,20);
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
