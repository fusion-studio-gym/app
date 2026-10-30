// Tests del parser de partes de clase y plantillas de partes (parseStaffText / staffFmtInfo).
// Correr con: node tests/staff-text.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/\/\/ <staff-text>[\s\S]*?\/\/ <\/staff-text>/);
if(!m) throw new Error('No encontré el bloque <staff-text>');
const ctx={}; vm.createContext(ctx);
vm.runInContext(m[0]+'\nthis.out={parseStaffText,staffFmtInfo,staffCatCanon,STPL_EXAMPLES,STAFF_CATS};',ctx);
const J=x=>JSON.parse(JSON.stringify(x));
const parse=t=>J(ctx.out.parseStaffText(t)), fmt=t=>J(ctx.out.staffFmtInfo(t));
const EX=ctx.out.STPL_EXAMPLES;
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }

test('los 9 ejemplos parsean sin advertencias',()=>{
  assert.strictEqual(EX.length,9);
  EX.forEach(t=>{ const r=parse(t); assert.deepStrictEqual(r.warnings,[],r.meta.name); assert.ok(r.meta.cat&&r.meta.name); });
});
test('movilidad: ejercicios con series y nota',()=>{
  const r=parse(EX[0]);
  assert.deepStrictEqual(r.meta,{cat:'Movilidad',name:'Movilidad tren superior',para:''});
  assert.strictEqual(r.parts.length,1); assert.strictEqual(r.parts[0].fmt.label,'Series');
  assert.deepStrictEqual(r.parts[0].items.map(i=>[i.name,i.sets]),[['CAT-VACA',['2 x 10']],['THORACIC OPENER',['2 x 8 c/l']],['WALL SLIDES',['2 x 12']]]);
  assert.deepStrictEqual(r.notes,['ritmo lento, sin dolor']);
});
test('aproximaciones: PARA y series sin nombre de ejercicio',()=>{
  const r=parse(EX[1]);
  assert.strictEqual(r.meta.para,'BANCO PLANO');
  assert.deepStrictEqual(r.parts[0].items,[{name:'',sets:['1 x 8 @4','1 x 5 @5','1 x 3 @6'],parts:[]}]);
});
test('core: superset con partes a) b)',()=>{
  const r=parse(EX[2]);
  assert.strictEqual(r.parts[0].name,'CORE');
  const it=r.parts[0].items;
  assert.deepStrictEqual(it[0].sets,['3 x 10 c/l']);
  assert.strictEqual(it[1].name,'COMBINADO x3');
  assert.deepStrictEqual(it[1].parts,[{n:'DEAD BUG',r:'10'},{n:'PLANCHA',r:'30"'}]);
});
test('AMRAP: reps adelante del ejercicio',()=>{
  const r=parse(EX[3]);
  assert.deepStrictEqual(r.parts[0].fmt,{label:'AMRAP · 5 min',known:true,min:5});
  assert.deepStrictEqual(r.parts[0].items.map(i=>i.name),['10 SIT-UPS','8 KB SWING @16 kg','6 BURPEES']);
});
test('OTM: filas Min 1, Min 2',()=>{
  const r=parse(EX[4]);
  assert.strictEqual(r.parts[0].fmt.label,'OTM · 6 min, minuto a minuto');
  assert.deepStrictEqual(r.parts[0].items.map(i=>[i.name,i.text]),[['Min 1','10 CAL REMO'],['Min 2','8 BURPEES']]);
});
test('etiquetas de las dinámicas',()=>{
  assert.strictEqual(parse(EX[5]).parts[0].fmt.label,'For time · 3 rondas · cap 6 min');
  assert.strictEqual(parse(EX[6]).parts[0].fmt.label,'Work 30" / Rest 15" · 6 rondas');
  assert.strictEqual(parse(EX[6]).parts[0].fmt.min,5);
  assert.strictEqual(parse(EX[7]).parts[0].fmt.label,'Escalera 8-6-4-2');
  assert.strictEqual(parse(EX[8]).parts[0].fmt.label,'Intervalos 4 × 1 min · descanso 30"');
  assert.strictEqual(fmt('for time').label,'For time · chipper');
  assert.strictEqual(fmt('TABATA').label,'Tabata · 20" / 10" · 8 rondas');
  assert.strictEqual(fmt('emom 10 min').label,'OTM · 10 min, minuto a minuto');
  assert.deepStrictEqual(fmt("CADA 3' x 4"),{label:'Cada 3 min × 4',known:true,min:12});
});
test('formato libre no es error',()=>{
  const r=parse('CATEGORIA: Cardio\nNOMBRE: x\nFORMATO: Death by burpees\n1) BURPEES');
  assert.deepStrictEqual(r.parts[0].fmt,{label:'Death by burpees',known:false,min:0});
  assert.deepStrictEqual(r.warnings,[]);
});
test('advertencias: categoría, nombre, más de 8 min, combinada sin ejercicio',()=>{
  const r=parse("FORMATO: AMRAP 12'\n1) BURPEES\na) DEAD BUG: 10");
  assert.strictEqual(r.warnings[0],'Falta CATEGORIA'); assert.strictEqual(r.warnings[1],'Falta NOMBRE');
  assert.ok(r.warnings.some(w=>/12 min\. Los finalizadores suelen ser de 4 a 8 min/.test(w)));
  assert.ok(r.warnings.some(w=>/Línea 3: parte combinada sin ejercicio/.test(w)));
  assert.ok(r.parts[0].items[0].sets.includes('a) DEAD BUG: 10'),'la línea no se pierde');
});
test('tolerancia: minúsculas, acentos, comillas curvas, ×, \\r\\n, coma decimal, comentarios',()=>{
  const r=parse('categoría: zona MEDIA\r\nNombre: Prueba\r\n// comentario\r\n\r\nformato: amrap 5’\r\n1) PLANCHA\r\n3 × 30” @7,5\r\nZ2 · 10\'');
  assert.strictEqual(r.meta.cat,'Zona media'); assert.strictEqual(r.meta.name,'Prueba');
  assert.strictEqual(r.parts[0].fmt.label,'AMRAP · 5 min');
  assert.deepStrictEqual(r.parts[0].items[0].sets,['3 x 30" @7.5',"Z2 · 10'"]);
  assert.deepStrictEqual(r.warnings,[]);
});
test('varias PARTE dentro de una plantilla; categoría propia se respeta',()=>{
  const r=parse("CATEGORIA: Entrada en calor\nNOMBRE: Doble\nPARTE: A\n1) SALTOS\n2 x 10\nPARTE: B\nFORMATO: AMRAP 4'\n1) 5 BURPEES");
  assert.strictEqual(r.meta.cat,'Entrada en calor');
  assert.deepStrictEqual(r.parts.map(p=>[p.name,p.fmt.label]),[['A','Series'],['B','AMRAP · 4 min']]);
});
test('texto vacío o libre nunca rompe',()=>{
  assert.deepStrictEqual(parse('').parts,[]);
  const r=parse("Z2 · 10'\ntrote suave");
  assert.deepStrictEqual(r.parts[0].items[0].sets,["Z2 · 10'",'trote suave']);
});
console.log(passed+' tests del parser de partes OK'+(process.exitCode?' (con fallas)':''));
