// Tests del calendario del bloque (fechas de cada semana y semana activa por fecha).
// Correr con: node tests/block-calendar.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/\/\/ <block-calendar>[\s\S]*?\/\/ <\/block-calendar>/);
if(!m) throw new Error('No encontré <block-calendar>');
// Dependencias de la app, simuladas: plan de 9 semanas y la lógica vieja de semana activa
const prelude=`var plan=Array.from({length:9},(_,i)=>({week:i+1,days:[]}));
var ST={activeWeek:null}; var blockCalendar=null; var calDebugToday=null;
function detectActiveWeek(){ return 3; } function groupActiveWeekIdx(){ return 6; }`;
const ctx={}; vm.createContext(ctx);
vm.runInContext(prelude+'\n'+m[0]+'\nthis.out={snapToMonday,weekRange,getActiveWeekInfo,dayDates,getActiveWeek,getNextWeekIdx,calTodayBA,calRangeTxt,calShortDay};'
  +'\nthis.set=(k,v)=>{ if(k==="cal") blockCalendar=v; if(k==="today") calDebugToday=v; if(k==="st") ST.activeWeek=v; };',ctx);
const F=ctx.out, J=x=>JSON.parse(JSON.stringify(x));
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }
const START='2026-11-02';
const info=t=>J(F.getActiveWeekInfo(t,START,9,null));

test('antes del inicio: before, falta 1 día',()=>assert.deepStrictEqual(info('2026-11-01'),{state:'before',week:null,forced:false,daysUntilStart:1}));
[['2026-11-02',1],['2026-11-03',1],['2026-11-08',1],['2026-11-09',2],['2026-12-28',9],['2027-01-03',9]].forEach(([d,w])=>
  test(d+' -> semana '+w,()=>assert.deepStrictEqual(info(d),{state:'running',week:w,forced:false})));
test('2027-01-04 -> finished',()=>assert.strictEqual(info('2027-01-04').state,'finished'));
test('forcedWeek=5 gana sin importar hoy',()=>{
  ['2026-10-01','2026-11-03','2027-03-01'].forEach(t=>assert.deepStrictEqual(J(F.getActiveWeekInfo(t,START,9,5)),{state:'running',week:5,forced:true}));
});
test('forcedWeek fuera de rango se ignora',()=>assert.strictEqual(J(F.getActiveWeekInfo('2026-11-03',START,9,12)).forced,false));
test('snapToMonday miércoles -> lunes anterior',()=>assert.deepStrictEqual(J(F.snapToMonday('2026-11-04')),{date:'2026-11-02',moved:true,originalWeekday:'miércoles'}));
test('snapToMonday lunes no se mueve',()=>assert.deepStrictEqual(J(F.snapToMonday('2026-11-02')),{date:'2026-11-02',moved:false,originalWeekday:'lunes'}));
test('snapToMonday domingo -> lunes anterior (no el siguiente)',()=>assert.strictEqual(F.snapToMonday('2026-11-08').date,'2026-11-02'));
test('rangos de las 9 semanas',()=>{
  const exp=['2/11 – 8/11','9/11 – 15/11','16/11 – 22/11','23/11 – 29/11','30/11 – 6/12','7/12 – 13/12','14/12 – 20/12','21/12 – 27/12','28/12 – 3/1'];
  assert.deepStrictEqual(exp.map((_,i)=>F.calRangeTxt(F.weekRange(START,i+1))),exp);
  assert.deepStrictEqual(J(F.weekRange(START,9)),{from:'2026-12-28',to:'2027-01-03'});
});
test('dayDates LUNES / MARTES',()=>assert.deepStrictEqual(J(F.dayDates(START,1,'LUNES / MARTES')),['2026-11-02','2026-11-03']));
test('dayDates MIÉRCOLES / JUEVES',()=>assert.deepStrictEqual(J(F.dayDates(START,1,'MIÉRCOLES / JUEVES')),['2026-11-04','2026-11-05']));
test('dayDates MIERCOLES sin tilde y minúsculas',()=>assert.deepStrictEqual(J(F.dayDates(START,1,'miercoles o jueves')),['2026-11-04','2026-11-05']));
test('dayDates VIERNES / SÁBADO',()=>assert.deepStrictEqual(J(F.dayDates(START,1,'VIERNES / SÁBADO')),['2026-11-06','2026-11-07']));
test('dayDates en la semana 2',()=>assert.deepStrictEqual(J(F.dayDates(START,2,'VIERNES / SABADO')),['2026-11-13','2026-11-14']));
test('dayDates texto no interpretable -> []',()=>{ assert.deepStrictEqual(J(F.dayDates(START,1,'NUEVO DÍA')),[]); assert.deepStrictEqual(J(F.dayDates(START,1,'')),[]); assert.deepStrictEqual(J(F.dayDates(START,1,undefined)),[]); });
test('formato de día: "Lun 2 nov"',()=>assert.strictEqual(F.calShortDay('2026-11-02')+' o '+F.calShortDay('2026-11-03'),'Lun 2 nov o Mar 3 nov'));
test('hoy en Buenos Aires, no en la zona del dispositivo',()=>{
  assert.strictEqual(F.calTodayBA(new Date('2026-11-03T02:30:00Z')),'2026-11-02'); // 23:30 del lunes en BA
  assert.strictEqual(F.calTodayBA(new Date('2026-11-03T03:00:00Z')),'2026-11-03');
});
test('sin calendario: la semana activa es la de siempre (alumno y grupo)',()=>{
  ctx.set('cal',null); ctx.set('st',null);
  assert.strictEqual(F.getActiveWeek(),3);
  assert.strictEqual(F.getActiveWeek({group:true}),6);
  ctx.set('st',1); assert.strictEqual(F.getActiveWeek(),1);
  assert.strictEqual(F.getNextWeekIdx(),7);
});
test('con calendario: por fecha, ignora la elección del alumno',()=>{
  ctx.set('st',7); ctx.set('cal',{startDate:START,forcedWeek:null});
  ctx.set('today','2026-11-03'); assert.strictEqual(F.getActiveWeek(),0); assert.strictEqual(F.getActiveWeek({group:true}),0); assert.strictEqual(F.getNextWeekIdx(),1);
  ctx.set('today','2026-11-20'); assert.strictEqual(F.getActiveWeek(),2);
  ctx.set('today','2026-10-20'); assert.strictEqual(F.getActiveWeek(),0); assert.strictEqual(F.getNextWeekIdx(),0);
  ctx.set('today','2027-02-01'); assert.strictEqual(F.getActiveWeek(),8); assert.strictEqual(F.getNextWeekIdx(),9);
  ctx.set('cal',{startDate:START,forcedWeek:5}); assert.strictEqual(F.getActiveWeek(),4);
  ctx.set('cal',null); ctx.set('today',null); ctx.set('st',null);
});
console.log(passed+' tests de calendario OK'+(process.exitCode?' (con fallas)':''));
