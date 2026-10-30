// Tests de las partes de clase por semana (guardado por parte, historial, faltantes, principal/accesorios).
// Correr con: node tests/staff-parts.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=(re,l)=>{ const m=html.match(re); if(!m) throw new Error('No encontré '+l); return m[0]; };
const code=[
  grab(/const STATUS = \{[^\n]*\n[\s\S]*?\/\/ <roles>[\s\S]*?\/\/ <\/roles>/,'<roles>'),
  grab(/\/\/ <staff-parts>[\s\S]*?\/\/ <\/staff-parts>/,'<staff-parts>'),
  'this.out={STAFF_ORDER,STAFF_HISTORY_MAX,applyStaffPartEdit,staffMissingParts,splitMainAcc};'
].join('\n');
const ctx={}; vm.createContext(ctx); vm.runInContext(code,ctx);
const J=x=>JSON.parse(JSON.stringify(x));
const {STAFF_ORDER,STAFF_HISTORY_MAX}=ctx.out;
const apply=(...a)=>J(ctx.out.applyStaffPartEdit(...a));
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }
const ana={uid:'t1',name:'Ana Profe'}, beto={uid:'t2',name:'Beto Profe'};

test('orden fijo de la semana',()=>assert.deepStrictEqual([...STAFF_ORDER],['mov','aprox','main','acc','zmedia','cardio']));
test('primera edición crea el documento de la semana',()=>{
  const d=apply(null,3,'d1','mov','CAT-VACA',ana,'2026-10-30T10:00:00Z');
  assert.deepStrictEqual(d,{week:3,days:{d1:{mov:{text:'CAT-VACA',by:'t1',byName:'Ana Profe',at:'2026-10-30T10:00:00Z',history:[]}}}});
});
test('editar una parte no toca las otras ni el documento de entrada',()=>{
  const base=apply(null,1,'d1','mov','A',ana,'t0');
  const frozen=JSON.stringify(base);
  const d=apply(base,1,'d1','cardio','REMO',beto,'t1','stpl_x');
  assert.strictEqual(JSON.stringify(base),frozen,'no muta la entrada');
  assert.strictEqual(d.days.d1.mov.text,'A'); assert.strictEqual(d.days.d1.cardio.text,'REMO');
  assert.strictEqual(d.days.d1.cardio.tplId,'stpl_x');
});
test('dos ediciones de la misma parte: gana la última y la anterior queda en historial',()=>{
  let d=apply(null,1,'d2','zmedia','primera',ana,'t1');
  d=apply(d,1,'d2','zmedia','segunda',beto,'t2');
  assert.strictEqual(d.days.d2.zmedia.text,'segunda'); assert.strictEqual(d.days.d2.zmedia.byName,'Beto Profe');
  assert.deepStrictEqual(d.days.d2.zmedia.history,[{text:'primera',by:'t1',byName:'Ana Profe',at:'t1'}]);
});
test('historial: últimas 10, la más nueva primero',()=>{
  let d=null; for(let i=0;i<15;i++) d=apply(d,1,'d1','mov','v'+i,ana,'t'+i);
  assert.strictEqual(d.days.d1.mov.text,'v14');
  assert.strictEqual(d.days.d1.mov.history.length,STAFF_HISTORY_MAX);
  assert.strictEqual(d.days.d1.mov.history[0].text,'v13'); assert.strictEqual(d.days.d1.mov.history[9].text,'v4');
});
test('faltantes por día',()=>{
  const wd={days:[{id:'d1',name:'DÍA 1'},{id:'d2',name:'DÍA 2'}]};
  let d=apply(null,1,'d1','mov','x',ana,'t'); d=apply(d,1,'d1','aprox','  ',ana,'t');
  ['mov','aprox','zmedia','cardio'].forEach(k=>{ d=apply(d,1,'d2',k,'ok',ana,'t'); });
  assert.deepStrictEqual(J(ctx.out.staffMissingParts(d,wd)),[{dayIdx:0,dayName:'DÍA 1',keys:['aprox','zmedia','cardio']}]);
  assert.strictEqual(J(ctx.out.staffMissingParts(null,wd)).length,2);
});
test('principal = primer ejercicio de cada parte; el resto, accesorios',()=>{
  const day={blocks:[{name:'TREN SUPERIOR',exercises:[{name:'BANCO'},{name:'ACC1'},{name:'ACC2'}]},{name:'TREN INFERIOR',exercises:[{name:'SQUAT'},{name:'ACC3'}]}]};
  const r=J(ctx.out.splitMainAcc(day));
  assert.deepStrictEqual(r.main.map(x=>x.ex.name),['BANCO','SQUAT']);
  assert.deepStrictEqual(r.acc.map(x=>x.block+':'+x.ex.name),['TREN SUPERIOR:ACC1','TREN SUPERIOR:ACC2','TREN INFERIOR:ACC3']);
});
console.log(passed+' tests de partes de clase OK'+(process.exitCode?' (con fallas)':''));
