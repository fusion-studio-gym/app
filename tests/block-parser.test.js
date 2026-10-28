// Tests del parser de bloques en texto (parseBlockText / planToText / mergeSafeEdit).
// Correr con: node tests/block-parser.test.js
// Toma las funciones directamente de index.html para probar exactamente el código publicado.
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function grab(re,label){ const m=html.match(re); if(!m) throw new Error('No encontré '+label+' en index.html'); return m[0]; }
// Extrae una función completa contando llaves desde "function nombre("
function grabFn(name){
  const start=html.indexOf('function '+name+'(');
  if(start===-1) throw new Error('No encontré function '+name);
  let i=html.indexOf('{',start), depth=0;
  for(;i<html.length;i++){ if(html[i]==='{') depth++; else if(html[i]==='}'){ depth--; if(depth===0) break; } }
  return html.slice(start,i+1);
}
const code=[
  grab(/const DEFAULT_TRACKED = \[[\s\S]*?\];/,'DEFAULT_TRACKED'),
  grabFn('matchTracked'),
  grabFn('buildDefaultWeek'),
  grabFn('buildDefaultRoutine'),
  grab(/\/\/ <block-text>[\s\S]*?\/\/ <\/block-text>/,'bloque <block-text>'),
  'this.out={DEFAULT_TRACKED,buildDefaultRoutine,parseBlockText,planToText,mergeSafeEdit};'
].join('\n');
const ctx={}; vm.createContext(ctx); vm.runInContext(code,ctx);
// Los objetos del contexto vm tienen otros prototipos: se copian con JSON para compararlos.
const J=x=>JSON.parse(JSON.stringify(x));
const {DEFAULT_TRACKED,planToText}=ctx.out;
const buildDefaultRoutine=()=>J(ctx.out.buildDefaultRoutine());
const parseBlockText=(t,o)=>J(ctx.out.parseBlockText(t,o));
const mergeSafeEdit=(a,p,n)=>J(ctx.out.mergeSafeEdit(a,p,n));

const stripIds=p=>JSON.parse(JSON.stringify(p,(k,v)=>k==='id'&&typeof v==='string'&&/^b?.*w\d+d\d+b/.test(v)?undefined:v));
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }

const example=fs.readFileSync(path.join(root,'bloque_ejemplo_9_semanas.txt'),'utf8');

test('el ejemplo de 9 semanas parsea sin errores',()=>{
  const r=parseBlockText(example,{bid:'x1',tracked:DEFAULT_TRACKED});
  assert.deepStrictEqual(r.errors,[],JSON.stringify(r.errors));
  assert.strictEqual(r.plan.length,9);
  assert.strictEqual(r.name,'Bloque 5 - 2026');
});
test('el ejemplo da exactamente buildDefaultRoutine() salvo los IDs',()=>{
  const r=parseBlockText(example,{bid:'x1'});
  assert.deepStrictEqual(stripIds(r.plan),stripIds(buildDefaultRoutine()));
});
test('IDs nuevos con prefijo de bloque y sin colisión con los viejos',()=>{
  const r=parseBlockText(example,{bid:'k9z'});
  const ids=[]; r.plan.forEach(w=>w.days.forEach(d=>d.blocks.forEach(b=>b.exercises.forEach(e=>ids.push(e.id)))));
  assert.strictEqual(new Set(ids).size,ids.length,'IDs repetidos');
  assert.ok(ids.every(id=>id.startsWith('bk9zw')),ids[0]);
  assert.strictEqual(r.plan[0].days[0].blocks[1].exercises[2].id,'bk9zw1d1ble3');
  const old=new Set(); buildDefaultRoutine().forEach(w=>w.days.forEach(d=>d.blocks.forEach(b=>b.exercises.forEach(e=>old.add(e.id)))));
  assert.ok(ids.every(id=>!old.has(id)));
});
test('planToText(parse(texto)) reproduce el texto canónico',()=>{
  const r=parseBlockText(example,{bid:'x'});
  assert.strictEqual(planToText(r.plan,{name:r.name}),example);
});
test('planToText(buildDefaultRoutine()) es el ejemplo canónico',()=>{
  assert.strictEqual(planToText(buildDefaultRoutine(),{name:'Bloque 5 - 2026'}),example);
});
test('íconos asignados automáticamente (mismos emojis de la app)',()=>{
  const r=parseBlockText('NOMBRE: X\nSEMANA 1\nDIA 1 (L)\nPARTE: TREN SUPERIOR\n1) A\n1 x 5\nPARTE: core\n1) B\n1 x 5\nDIA 2\nPARTE: TREN INFERIOR\n1) C\n1 x 5\nDIA 3\nPARTE: TREN SUPERIOR\n1) D\n1 x 5\nDIA 4\nPARTE: TREN SUPERIOR\n1) E\n1 x 5\n');
  assert.deepStrictEqual(r.errors,[]);
  const w=r.plan[0];
  assert.deepStrictEqual(w.days.map(d=>d.icon),['🏋️','⚡','🔥','📌']);
  assert.deepStrictEqual(w.days[0].blocks.map(b=>[b.id,b.icon,b.name]),[['u','💪','TREN SUPERIOR'],['p2','📌','CORE']]);
  assert.strictEqual(w.days[1].blocks[0].icon,'🦵');
});
test('tolerancia: acentos, minúsculas, comillas curvas, ×, coma decimal, \\r\\n, espacios, numeración errónea',()=>{
  const t='nombre:  Prueba\r\n\r\n// comentario\r\nsemana 1\r\ndía 1 (miércoles / jueves)\r\nparte: tren inferior\r\n7)  back squat (pausa 2” abajo)\r\n1 × 1 @8\r\n3 x 4 @7,5\r\n7) combinado X3\r\na) estocadas:  6 c/l @7\r\nb) salto: 20″/30″\r\nc) plancha: 30" @2\r\n';
  const r=parseBlockText(t,{bid:'t'});
  assert.deepStrictEqual(r.errors,[],JSON.stringify(r.errors));
  const d=r.plan[0].days[0];
  assert.strictEqual(d.days,'MIÉRCOLES / JUEVES');
  const [a,b]=d.blocks[0].exercises;
  assert.strictEqual(a.order,'1º'); assert.strictEqual(b.order,'2º');
  assert.strictEqual(a.name,'BACK SQUAT (PAUSA 2" ABAJO)');
  assert.deepStrictEqual(a.sets,[{r:'1',rpe:'@8'},{r:'4',rpe:'@7.5'},{r:'4',rpe:'@7.5'},{r:'4',rpe:'@7.5'}]);
  assert.strictEqual(b.type,'superset'); assert.strictEqual(b.count,3);
  assert.deepStrictEqual(b.parts,[{pid:'a',name:'ESTOCADAS',r:'6 c/l',rpe:'@7'},{pid:'b',name:'SALTO',r:'20"/30"',rpe:'-'},{pid:'c',name:'PLANCHA',r:'30"',rpe:'@2'}]);
});
test('RPE doble @8.5/@9',()=>{
  const r=parseBlockText('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: TREN SUPERIOR\n1) BANCO PLANO\n1 x 1 @8.5/@9\n');
  assert.strictEqual(r.plan[0].days[0].blocks[0].exercises[0].sets[0].rpe,'@8.5/@9');
});
const errLines=t=>parseBlockText(t).errors.map(e=>e.line);
test('errores con número de línea',()=>{
  assert.deepStrictEqual(errLines('SEMANA 1\nDIA 1\nPARTE: X\n1) A\n1 x 5\n'),[1]); // sin NOMBRE
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\n'),[2]); // semana sin días
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\n'),[3]); // día sin partes
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) A\n'),[5]); // ejercicio sin series
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) SUPERSET\na) A: 5\nb) B: 5\n'),[5]); // sin xN
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) SUPERSET x3\na) A: 5\n'),[5]); // menos de 2 partes
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) SUPERSET x3\na) A: 5\nb) B\n'),[5,7]); // parte sin reps
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) A\n1 x 5\nhola que tal\n'),[7]); // línea rara
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) A\n1 x 5\nSEMANA 1\nDIA 1\nPARTE: X\n1) A\n1 x 5\n'),[7]); // repetida
  assert.deepStrictEqual(errLines('NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: X\n1) A\n1 x 5\nSEMANA 3\nDIA 1\nPARTE: X\n1) A\n1 x 5\n'),[7]); // salteada
});
test('advertencias: sin RPE, nombre base sin PR, distinta cantidad de ejercicios',()=>{
  const t='NOMBRE: X\nSEMANA 1\nDIA 1\nPARTE: TREN SUPERIOR\n1) BANCO PLANOO\n3 x 5\n2) REMO\n3 x 5\nSEMANA 2\nDIA 1\nPARTE: TREN SUPERIOR\n1) BANCO PLANO C/BARRA\n3 x 5 @7\n3) PESO MUERTO RUMANO\n3 x 8\n4) BICEPS\n3 x 8\n';
  const r=parseBlockText(t,{tracked:DEFAULT_TRACKED});
  assert.deepStrictEqual(r.errors,[]);
  assert.deepStrictEqual(r.warnings.map(w=>w.line),[5,5,9]);
});
test('mergeSafeEdit: conserva IDs/íconos y bloquea cambios de estructura',()=>{
  const active=buildDefaultRoutine();
  const txt=planToText(active,{name:'B4'});
  const edited=txt.replace('1) BANCO PLANO C/BARRA (PAUSA 2")\n4 x 6 @6','1) BANCO PLANO C/BARRA (PAUSA 3")\n5 x 5 @7').replace('a) PRESS MILITAR CON BARRA: 8 @2','a) PRESS MILITAR CON BARRA: 10 @2');
  const r=mergeSafeEdit(active,parseBlockText(edited),'B4');
  assert.deepStrictEqual(r.errors,[]);
  const ex=r.plan[0].days[0].blocks[0].exercises;
  assert.strictEqual(ex[0].id,'w1d1bue1'); assert.strictEqual(ex[0].name,'BANCO PLANO C/BARRA (PAUSA 3")');
  assert.strictEqual(ex[0].sets.length,5); assert.strictEqual(ex[1].parts[0].r,'10');
  assert.strictEqual(r.plan[0].days[0].icon,'🏋️'); assert.strictEqual(r.warnings.length,1);
  // agregar un ejercicio -> error
  const added=txt.replace('PARTE: TREN INFERIOR\n1) PESO MUERTO C/PAUSA','PARTE: TREN INFERIOR\n0) NUEVO\n3 x 5\n1) PESO MUERTO C/PAUSA');
  assert.ok(mergeSafeEdit(active,parseBlockText(added),'B4').errors.length>=1);
  // cambiar NOMBRE -> error
  assert.strictEqual(mergeSafeEdit(active,parseBlockText(txt),'OTRO').errors[0].line,1);
  // íconos personalizados del plan activo se mantienen
  const custom=JSON.parse(JSON.stringify(active)); custom[0].days[0].icon='📌'; custom[0].days[0].blocks[0].icon='🔥';
  const r2=mergeSafeEdit(custom,parseBlockText(txt),'B4');
  assert.strictEqual(r2.plan[0].days[0].icon,'📌'); assert.strictEqual(r2.plan[0].days[0].blocks[0].icon,'🔥');
});

console.log(passed+' tests OK'+(process.exitCode?' (con fallas)':''));
