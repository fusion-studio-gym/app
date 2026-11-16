// Tests de "Semana pasada" (lógica pura: qué semana se usa y cómo se unen los ejercicios).
// Correr con: node tests/last-week.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/\/\/ <last-week>[\s\S]*?\/\/ <\/last-week>/);
if(!m) throw new Error('No encontré <last-week>');
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const tracked=html.match(/const DEFAULT_TRACKED = \[[\s\S]*?\];/)[0];
const ctx={}; vm.createContext(ctx);
vm.runInContext([tracked,grabFn('matchTracked'),m[0],'this.F={lastWeekRefs,lwNorm,DEFAULT_TRACKED};'].join('\n'),ctx);
const {lastWeekRefs,lwNorm,DEFAULT_TRACKED}=ctx.F;
const J=x=>JSON.parse(JSON.stringify(x));
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }

// Plan de prueba: 3 semanas, 2 días. Día 1 = Tren Superior (banco + combinado de 2 partes).
const set=(n,r='6')=>Array.from({length:n},()=>({r,rpe:'@6'}));
function week(w,opt={}){
  return {week:w,days:[
    {name:'DÍA 1',blocks:[{id:'u',name:'TREN SUPERIOR',exercises:[
      {order:'1º',id:`w${w}d1e1`,type:'single',name:opt.benchName||'BANCO PLANO C/BARRA (PAUSA 2")',sets:set(opt.benchSets||4)},
      {order:'2º',id:`w${w}d1e2`,type:'superset',count:3,parts:[{pid:'a',name:opt.dipName||'FONDOS EN BANCO',r:'8'},{pid:'b',name:'TRICEPS ACOSTADO',r:'12'}]},
    ]}]},
    {name:'DÍA 2',blocks:[{id:'l',name:'TREN INFERIOR',exercises:[
      {order:'1º',id:`w${w}d2e1`,type:'single',name:'BACK SQUAT',sets:set(3)},
    ]}]},
  ]};
}
const P=(w,d)=>({weight:w,notes:'',done:!!d});

test('semana 3 con registros en la 2: usa la semana 2',()=>{
  const plan=[week(1),week(2),week(3)];
  const prog={w1d1e1_s0:P('70',1),w2d1e1_s0:P('80',1),w2d1e1_s1:{weight:'82.5',notes:'se movió lento',done:false}};
  const r=J(lastWeekRefs(plan,2,0,prog,DEFAULT_TRACKED));
  assert.strictEqual(r.semana,2);
  assert.deepStrictEqual(r.mapa.w3d1e1_s0,{semana:2,nombreAnterior:null,variante:false,peso:'80',hecho:true,nota:''});
  assert.deepStrictEqual(r.mapa.w3d1e1_s1,{semana:2,nombreAnterior:null,variante:false,peso:'82.5',hecho:false,nota:'se movió lento'});
  assert.strictEqual(r.mapa.w3d1e1_s2.sinRegistro,true,'serie sin datos en la semana 2');
});
test('semana 3, semana 2 vacía, semana 1 con registros: usa la 1 (Sem. 1)',()=>{
  const plan=[week(1),week(2),week(3)];
  const r=J(lastWeekRefs(plan,2,0,{w1d1e1_s0:P('70',1)},DEFAULT_TRACKED));
  assert.strictEqual(r.semana,1); assert.strictEqual(r.mapa.w3d1e1_s0.semana,1); assert.strictEqual(r.mapa.w3d1e1_s0.peso,'70');
});
test('una nota sola o un check solo también cuentan como registro',()=>{
  const plan=[week(1),week(2),week(3)];
  assert.strictEqual(lastWeekRefs(plan,2,0,{w1d1e1_s0:P('70'),w2d1e1_s3:{weight:'',notes:'dolor',done:false}},null).semana,2);
  assert.strictEqual(lastWeekRefs(plan,2,0,{w1d1e1_s0:P('70'),w2d1e2_b_s0:{weight:'',notes:'',done:true}},null).semana,2);
  assert.strictEqual(lastWeekRefs(plan,2,0,{w1d1e1_s0:P('70'),w2d1e1_s0:{weight:' ',notes:'',done:false}},null).semana,1,'espacios no cuentan');
});
test('semana 1 del bloque: no muestra nada',()=>{
  const r=J(lastWeekRefs([week(1),week(2)],0,0,{w1d1e1_s0:P('70',1)},DEFAULT_TRACKED));
  assert.deepStrictEqual(r,{semana:null,mapa:{}});
});
test('cada día busca por separado: Día 1 usa la 2, Día 2 sin registro',()=>{
  const plan=[week(1),week(2),week(3)];
  const prog={w2d1e1_s0:P('80',1)};
  const d1=J(lastWeekRefs(plan,2,0,prog,DEFAULT_TRACKED)), d2=J(lastWeekRefs(plan,2,1,prog,DEFAULT_TRACKED));
  assert.strictEqual(d1.semana,2);
  assert.strictEqual(d2.semana,null);
  assert.deepStrictEqual(Object.keys(d2.mapa),['w3d2e1_s0','w3d2e1_s1','w3d2e1_s2']);
  Object.values(d2.mapa).forEach(v=>assert.strictEqual(v.sinRegistro,true));
});
test('no usa datos de semanas posteriores',()=>{
  const plan=[week(1),week(2),week(3)];
  assert.strictEqual(lastWeekRefs(plan,1,0,{w3d1e1_s0:P('90',1)},null).mapa.w2d1e1_s0.sinRegistro,true);
});
test('mismo ejercicio con otra pausa: se une sin avisar variante',()=>{
  const plan=[week(1),week(2,{benchName:'BANCO PLANO C/BARRA (PAUSA 1")'}),week(3,{benchName:'Banco plano c/barra (pausa 2")'})];
  const r=lastWeekRefs(plan,2,0,{w2d1e1_s0:P('80',1)},DEFAULT_TRACKED).mapa.w3d1e1_s0;
  assert.strictEqual(r.peso,'80'); assert.strictEqual(r.variante,false); assert.strictEqual(r.nombreAnterior,null);
});
test('mismo nombre con distinto acento/espacios/mayúsculas: se une sin variante',()=>{
  assert.strictEqual(lwNorm('  Subidas  de frente al CAJÓN '),'subidas de frente al cajon');
  const plan=[week(1,{dipName:'Fondos  en  bánco'}),week(2,{dipName:'FONDOS EN BANCO'})];
  const r=lastWeekRefs(plan,1,0,{w1d1e2_a_s0:P('10')},null).mapa.w2d1e2_a_s0;
  assert.strictEqual(r.peso,'10'); assert.strictEqual(r.variante,false);
});
test('otro nombre y otro ejercicio base: se une por posición y avisa variante',()=>{
  const plan=[week(1),week(2,{dipName:'FONDOS EN PARALELAS'})];
  const r=lastWeekRefs(plan,1,0,{w1d1e2_a_s0:P('5',1)},DEFAULT_TRACKED).mapa;
  assert.strictEqual(r.w2d1e2_a_s0.peso,'5'); assert.strictEqual(r.w2d1e2_a_s0.variante,true);
  assert.strictEqual(r.w2d1e2_a_s0.nombreAnterior,'FONDOS EN BANCO');
  assert.strictEqual(r.w2d1e2_b_s0.variante,false,'la parte b no cambió');
});
test('Peso Muerto Rumano en lugar de Peso Muerto: variante (otro ejercicio base)',()=>{
  const plan=[week(1),week(2,{benchName:'PESO MUERTO RUMANO'})];
  plan[0].days[0].blocks[0].exercises[0].name='PESO MUERTO C/PAUSA 2"';
  const r=lastWeekRefs(plan,1,0,{w1d1e1_s0:P('100')},DEFAULT_TRACKED).mapa.w2d1e1_s0;
  assert.strictEqual(r.variante,true);
});
test('semana pasada con 4 series y hoy 3: sin error, se unen las 3 primeras',()=>{
  const plan=[week(1,{benchSets:4}),week(2,{benchSets:3})];
  const prog={w1d1e1_s0:P('80'),w1d1e1_s1:P('81'),w1d1e1_s2:P('82'),w1d1e1_s3:P('83')};
  const r=lastWeekRefs(plan,1,0,prog,DEFAULT_TRACKED).mapa;
  assert.deepStrictEqual(['w2d1e1_s0','w2d1e1_s1','w2d1e1_s2'].map(k=>r[k].peso),['80','81','82']);
  assert.ok(!('w2d1e1_s3' in r));
});
test('hoy hay más series que la semana pasada: las nuevas muestran Sin registro',()=>{
  const plan=[week(1,{benchSets:3}),week(2,{benchSets:4})];
  const r=lastWeekRefs(plan,1,0,{w1d1e1_s0:P('80')},null).mapa;
  assert.strictEqual(r.w2d1e1_s3.sinRegistro,true); assert.strictEqual(r.w2d1e1_s3.semana,1);
});
test('combinado: se unen las partes a y b por posición',()=>{
  const plan=[week(1),week(2)];
  const prog={w1d1e2_a_s0:P('10',1),w1d1e2_b_s0:P('8'),w1d1e2_a_s2:P('12'),w1d1e2_b_s2:{weight:'',notes:'hombro',done:true}};
  const r=J(lastWeekRefs(plan,1,0,prog,DEFAULT_TRACKED).mapa);
  assert.strictEqual(r.w2d1e2_a_s0.peso,'10'); assert.strictEqual(r.w2d1e2_a_s0.hecho,true);
  assert.strictEqual(r.w2d1e2_b_s0.peso,'8');
  assert.strictEqual(r.w2d1e2_a_s2.peso,'12');
  assert.deepStrictEqual([r.w2d1e2_b_s2.peso,r.w2d1e2_b_s2.hecho,r.w2d1e2_b_s2.nota],['',true,'hombro'],'sin peso, hecha y con nota');
  assert.strictEqual(r.w2d1e2_a_s1.sinRegistro,true);
});
test('cambió el tipo (simple → combinado): busca por nombre en el mismo día',()=>{
  const plan=[week(1),week(2)];
  // En la semana 2 la posición 2º pasa a ser un ejercicio simple que la semana 1 tenía como parte... no existe como simple → sin registro
  plan[1].days[0].blocks[0].exercises[1]={order:'2º',id:'w2d1e2',type:'single',name:'FONDOS EN BANCO',sets:set(3)};
  let r=lastWeekRefs(plan,1,0,{w1d1e2_a_s0:P('10')},null).mapa;
  assert.strictEqual(r.w2d1e2_s0.sinRegistro,true);
  // Si la semana 1 lo tenía como simple en otra posición, lo encuentra por nombre
  plan[0].days[0].blocks[0].exercises.push({order:'3º',id:'w1d1e3',type:'single',name:'Fondos en banco',sets:set(3)});
  r=lastWeekRefs(plan,1,0,{w1d1e2_a_s0:P('10'),w1d1e3_s1:P('15')},null).mapa;
  assert.strictEqual(r.w2d1e2_s1.peso,'15'); assert.strictEqual(r.w2d1e2_s1.variante,false);
});
test('la posición ya no existe: busca por nombre y si no está, Sin registro',()=>{
  const plan=[week(1),week(2)];
  plan[1].days[0].blocks[0].exercises.push({order:'3º',id:'w2d1e3',type:'superset',count:2,parts:[{pid:'a',name:'TRICEPS ACOSTADO'},{pid:'b',name:'REMO'}]});
  const r=lastWeekRefs(plan,1,0,{w1d1e2_b_s1:P('9')},null).mapa;
  assert.strictEqual(r.w2d1e3_a_s1.peso,'9','encontrado por nombre en el combinado 2º');
  assert.strictEqual(r.w2d1e3_b_s0.sinRegistro,true);
});
test('no cambia el progress ni el plan',()=>{
  const plan=[week(1),week(2)]; const prog={w1d1e1_s0:P('80',1)};
  const a=JSON.stringify([plan,prog]); lastWeekRefs(plan,1,0,prog,DEFAULT_TRACKED);
  assert.strictEqual(JSON.stringify([plan,prog]),a);
});
test('entradas inválidas no rompen',()=>{
  assert.deepStrictEqual(J(lastWeekRefs(null,2,0,{},null)),{semana:null,mapa:{}});
  assert.deepStrictEqual(J(lastWeekRefs([week(1)],3,0,{},null)),{semana:null,mapa:{}});
  assert.deepStrictEqual(J(lastWeekRefs([week(1),week(2)],1,5,{},null)),{semana:null,mapa:{}});
  assert.ok(lastWeekRefs([week(1),week(2)],1,0,null,null));
});
console.log(passed+' tests ok');
