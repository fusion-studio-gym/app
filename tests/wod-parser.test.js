// Tests del Club WOD: parser de la planificación semanal y funciones puras (racha, registro, progresión).
// Caso real: planificación de noviembre 2026 (pegada como sale de Word y como sale de un PDF).
// Correr con: node tests/wod-parser.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const block=(a,b)=>{ const m=html.match(new RegExp('// <'+a+'>[\\s\\S]*?// </'+b+'>')); if(!m) throw new Error('No encontré <'+a+'>'); return m[0]; };
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const ctx={}; vm.createContext(ctx);
vm.runInContext([grabFn('hashStr'),block('block-calendar','block-calendar').replace(/function getBlockCalInfo[\s\S]*$/,''),block('wod-core','wod-core'),
  'this.W={parseWodText,wodStreak,wodWeekCount,wodValidateLog,wodFmtResult,wodSimilar,wodDiff,wodProgressPairs,wodInferScore,wodCells,wodSexRow,wodDateLine,wodWeekSig,wodStatusOf,wodTeacherListed};'].join('\n'),ctx);
const W=ctx.W, J=x=>JSON.parse(JSON.stringify(x));
const fx=n=>fs.readFileSync(path.join(__dirname,'fixtures',n),'utf8');
let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.stack.split('\n').slice(0,3).join('\n      ')); process.exitCode=1; } }
const REF='2026-11-26';
const DATES=['2026-11-02','2026-11-04','2026-11-06','2026-11-09','2026-11-11','2026-11-13','2026-11-16','2026-11-18','2026-11-20','2026-11-23','2026-11-25','2026-11-27'];

['word','layout'].forEach(kind=>{
  const P=J(W.parseWodText(fx('wod-noviembre-2026-'+kind+'.txt'),{ref:REF}));
  const day=date=>{ for(const w of P.weeks) for(const d of w.days) if(d.date===date) return d; return null; };
  test(kind+': 4 semanas, 12 días, sin errores',()=>{
    assert.deepStrictEqual(P.errors,[]);
    assert.deepStrictEqual(P.weeks.map(w=>w.id),['2026-11-02','2026-11-09','2026-11-16','2026-11-23']);
    assert.deepStrictEqual(P.weeks.map(w=>w.label),['SEMANA 1','SEMANA 2','SEMANA 3','SEMANA 4']);
    assert.deepStrictEqual(P.weeks.flatMap(w=>w.days.map(d=>d.date)),DATES);
  });
  test(kind+': cada día tiene warm up (solo staff) y al menos un WOD',()=>{
    DATES.forEach(dt=>{ const d=day(dt); assert.ok(/MOVILIDAD/.test(d.warmupText),dt); assert.ok(d.wods.length>=1,dt);
      d.wods.forEach(w=>assert.ok(!JSON.stringify(w.contentLines).includes('Activaciones de mu'),dt+' warm up filtrado al WOD')); });
  });
  test(kind+': etiquetas FERIADO',()=>{
    assert.deepStrictEqual(DATES.filter(dt=>day(dt).label).map(dt=>[dt,day(dt).label]),[['2026-11-09','FERIADO'],['2026-11-11','FERIADO'],['2026-11-23','FERIADO']]);
  });
  test(kind+': WODs por día, partner, TC, sector y tipo de registro',()=>{
    const sum=dt=>day(dt).wods.map(w=>[w.id,w.partner,w.timeCap,w.sector,w.scoreType]);
    assert.deepStrictEqual(sum('2026-11-02'),[['U',false,'','','completed']]);          // OTM x 30'
    assert.deepStrictEqual(sum('2026-11-04'),[['A',false,"5'",'','time'],['B',false,'','','reps']]);
    assert.deepStrictEqual(sum('2026-11-06'),[['U',true,"35' / 40'",'','time']]);
    assert.deepStrictEqual(sum('2026-11-09'),[['U',false,'','','reps']]);               // 4' Work x 1' Rest
    assert.deepStrictEqual(sum('2026-11-11'),[['A',false,"16'",'ESCALERA','time'],['B',false,'','JAULA','reps']]);
    assert.deepStrictEqual(sum('2026-11-13'),[['U',true,'','','reps']]);
    assert.deepStrictEqual(sum('2026-11-16'),[['U',false,'','','reps']]);               // "B) WARM UP" mal tipeado
    assert.deepStrictEqual(sum('2026-11-18'),[['A',false,'','','reps'],['B',false,'','','reps']]);
    assert.deepStrictEqual(sum('2026-11-20'),[['U',true,"25' / 30' / 35'",'','time']]);
    assert.deepStrictEqual(sum('2026-11-23'),[['A',false,"16'",'ESCALERA','rounds'],['B',false,'','JAULA','reps']]);
    assert.deepStrictEqual(sum('2026-11-25'),[['A',false,'','','reps'],['B',false,'','','reps']]);
    assert.deepStrictEqual(sum('2026-11-27'),[['U',true,"35' / 40'",'','time']]);
  });
  test(kind+': tablas de pesos por sexo y nivel',()=>{
    const t=day('2026-11-02').wods[0].weightTables;
    assert.strictEqual(t.length,2);
    assert.strictEqual(t[0].kind,'level'); assert.deepStrictEqual(t[0].levels,['rx','avanzado','intermedio','principiante']);
    assert.deepStrictEqual(t[0].rows.map(r=>r.label),['T2B/K2C','Pull Ups','BMU']);
    assert.strictEqual(t[1].kind,'sex'); assert.strictEqual(t[1].rows.length,8);
    assert.deepStrictEqual(t[1].rows[0],{sex:'F',level:'principiante',label:'Mujeres principiante',cells:['30/35']});
    assert.deepStrictEqual(t[1].rows[7],{sex:'M',level:'rx',label:'Hombres Rx',cells:['80']});
    const t6=day('2026-11-06').wods[0].weightTables[0];
    assert.deepStrictEqual(t6.head,['PESO 1','PESO 2','PESO 3','PESO 4']); assert.deepStrictEqual(t6.rows[3].cells,['40','45','50','55']);
    const t23=day('2026-11-23').wods[0].weightTables[0];
    assert.deepStrictEqual(t23.head,['RONDA 1 - 2 · 4 REPS','RONDA 3 - 4 · 3 REPS','RONDA 5 - 6 · 2 REPS','RONDA 7 - 8 · 1 REP']);
    assert.deepStrictEqual(t23.rows.find(r=>r.sex==='M'&&r.level==='intermedio').cells,['50','55','60','65/70']);
    assert.deepStrictEqual(day('2026-11-20').wods[0].weightTables[0].head,['Deadlift','Hang Power Clean / Front Squat','Thrusters']);
    assert.deepStrictEqual(day('2026-11-13').wods[0].weightTables[0].head,['Front Rack Lunges','Thrusters']);
    assert.strictEqual(day('2026-11-04').wods[0].weightTables.length,0); // pesos dentro del texto
    assert.ok(JSON.stringify(day('2026-11-04').wods[0].contentLines).includes('(MUJERES: 25/30/35, HOMBRES: 40/45/50)'));
  });
  test(kind+': movimientos y texto respetan mayúsculas',()=>{
    const c=day('2026-11-11').wods[0].contentLines;
    assert.ok(c.some(l=>l.t==='mov'&&l.s==='Deadlift'));
    assert.ok(c.some(l=>l.t==='text'&&/^REST 6/.test(l.s)),'REST queda al final del WOD A');
    assert.ok(c.some(l=>l.t==='table'));
  });
  test(kind+': el WOD B no se come la tabla del A',()=>{
    assert.strictEqual(day('2026-11-23').wods[1].weightTables.length,0);
    assert.ok(day('2026-11-23').wods[0].contentLines.some(l=>l.t==='text'&&/^REST 6/.test(l.s)));
  });
  test(kind+': WOD parecido (9/11 y 16/11, misma estructura)',()=>{
    const a=day('2026-11-09').wods[0], b=day('2026-11-16').wods[0];
    assert.strictEqual(a.structure,"4' WORK X 1' REST (XN)");
    assert.ok(W.wodSimilar(a,b));
    assert.ok(!W.wodSimilar(a,day('2026-11-25').wods[0]));
    assert.ok(!W.wodSimilar(day('2026-11-18').wods[0],day('2026-11-25').wods[0]),'mismo formato pero otros movimientos');
  });
});

test('ejemplo del pedido (columnas WOD A / WOD B en el warm up y "..." en la tabla)',()=>{
  const t=`SEMANA 4

23/11 - FERIADO

A) WARM UP
MOVILIDAD - 2 RONDAS
- 10 Activaciones de muñeca
- 10 Rotación de Tronco (5 c/l)

WOD A              WOD B
3 RONDAS           3 RONDAS
- 2 Deadlift       - 5 Balanceos Amplios
- 2 Hang Power Clean   - 5 Burpees

B) WODs

WOD A – SECTOR ESCALERA
8 RONDAS - TC: 16'
- Power Clean*
- 8 / 10 / 12 Step Burpee

TABLA DE PESOS RECOMENDADOS
                     RONDA 1 - 2   RONDA 3 - 4   RONDA 5 - 6   RONDA 7 - 8
Mujeres principiante 30            30            35            35/40
Mujeres intermedio   35            35            40            45/50
...
Hombres Rx           60            70            80            90

REST 6'/8' ENTRE WODs – DEBE SER UNA PAUSA COMPLETA ANTES DE PREPARARSE PARA EL WOD B

WOD B – SECTOR JAULA
2' Work x 2' Work (x4, alterno)
- 5 Pull Ups / T2B
- 10 Push Ups`;
  const P=J(W.parseWodText(t,{ref:REF}));
  assert.deepStrictEqual(P.errors,[]);
  const d=P.weeks[0].days[0];
  assert.strictEqual(d.label,'FERIADO'); assert.ok(d.warmupText.includes('WOD A'));
  assert.deepStrictEqual(d.wods.map(w=>[w.id,w.sector,w.scoreType,w.timeCap]),[['A','ESCALERA','rounds',"16'"],['B','JAULA','reps','']]);
  const tb=d.wods[0].weightTables[0];
  assert.deepStrictEqual(tb.head,['RONDA 1 - 2','RONDA 3 - 4','RONDA 5 - 6','RONDA 7 - 8']);
  assert.deepStrictEqual(tb.rows.map(r=>r.label),['Mujeres principiante','Mujeres intermedio','Hombres Rx']);
});
test('letras mal puestas: "A) WOD" y "B) WARM UP" se leen por la palabra',()=>{
  const P=J(W.parseWodText('1/12\nB) WARM UP\n- 10 Squats\nA) WOD\nAMRAP 12\'\n- 10 Burpees',{ref:REF}));
  const d=P.weeks[0].days[0];
  assert.strictEqual(d.date,'2026-12-01'); assert.ok(d.warmupText.includes('Squats'));
  assert.deepStrictEqual(d.wods.map(w=>[w.id,w.scoreType]),[['U','reps']]);
});
test('REGISTRO: explícito gana y no se muestra',()=>{
  const P=J(W.parseWodText('2/12\nA) WARM UP\n- x\nB) WOD\nFOR TIME\nREGISTRO: rondas\n- 10 Burpees',{ref:REF}));
  const w=P.weeks[0].days[0].wods[0];
  assert.strictEqual(w.scoreType,'rounds'); assert.strictEqual(w.scoreHow,'explicit');
  assert.ok(!JSON.stringify(w.contentLines).includes('REGISTRO'));
});
test('formato ambiguo -> completado con advertencia',()=>{
  const P=J(W.parseWodText('3/12\nB) WOD\nCHIPPER LOCO\n- 10 Burpees',{ref:REF}));
  assert.strictEqual(P.weeks[0].days[0].wods[0].scoreType,'completed');
  assert.ok(P.warnings.some(w=>/no se reconoce el formato/.test(w.msg)));
});
test('marcas de lo no interpretado: sin fecha, sin B) WOD, fecha inválida y repetida',()=>{
  const P=J(W.parseWodText('texto suelto\n4/12\nA) WARM UP\n- 5 Squats\n31/11\n4/12\nB) WOD\nFOR TIME\n- 1 Run',{ref:REF}));
  assert.ok(P.warnings.some(w=>w.line===1&&/Fuera de un día/.test(w.msg)));
  assert.ok(P.warnings.some(w=>/no encontré "B\) WOD"/.test(w.msg)));
  assert.ok(P.errors.some(e=>e.line===5&&/inválida/.test(e.msg)));
  assert.ok(P.errors.some(e=>/repetida/.test(e.msg)));
});
test('año implícito: en diciembre, "5/1" es enero del año siguiente; dd/mm y d/m/aaaa',()=>{
  assert.strictEqual(W.wodDateLine('5/1','2026-12-20').date,'2027-01-05');
  assert.strictEqual(W.wodDateLine('05/01 - FERIADO','2026-12-20').label,'FERIADO');
  assert.strictEqual(W.wodDateLine('2/11/2025','2026-12-20').date,'2025-11-02');
  assert.strictEqual(W.wodDateLine('2/3/4 Front Squat',REF),null);
  assert.strictEqual(W.wodDateLine('150/200 mts Row',REF),null);
});
test('mes entero sin SEMANA: se separa por fecha',()=>{
  const P=J(W.parseWodText('2/11\nB) WOD\nAMRAP 10\n- 5 Burpees\n9/11\nB) WOD\nAMRAP 10\n- 5 Burpees',{ref:REF}));
  assert.deepStrictEqual(P.weeks.map(w=>w.id),['2026-11-02','2026-11-09']);
});
test('racha: semanas lun–dom con 2+ WODs; la semana en curso no corta',()=>{
  const logs=['2026-11-02','2026-11-04','2026-11-09','2026-11-11','2026-11-13','2026-11-16','2026-11-18','2026-11-25'];
  assert.strictEqual(W.wodStreak(logs,'2026-11-26'),3); // semana actual con 1: no suma ni corta
  assert.strictEqual(W.wodStreak(logs.concat('2026-11-26'),'2026-11-26'),4);
  assert.strictEqual(W.wodStreak(['2026-11-02','2026-11-04','2026-11-16','2026-11-18'],'2026-11-26'),1); // semana del 9 cortó
  assert.strictEqual(W.wodStreak([],'2026-11-26'),0);
  assert.strictEqual(W.wodWeekCount(logs,'2026-11-26'),1);
});
test('validación del registro',()=>{
  assert.strictEqual(W.wodValidateLog({scoreType:'time',min:'4',sec:'30'}).ok,false); // sin categoría
  assert.strictEqual(J(W.wodValidateLog({level:'rx',scoreType:'time',min:'4',sec:'30'})).log.timeSec,270);
  assert.strictEqual(W.wodValidateLog({level:'rx',scoreType:'time',min:'4',sec:'75'}).ok,false);
  assert.strictEqual(J(W.wodValidateLog({level:'rx',scoreType:'time',capped:true,reps:'85'})).log.reps,85);
  assert.strictEqual(W.wodValidateLog({level:'rx',scoreType:'reps',reps:''}).ok,false);
  assert.deepStrictEqual([J(W.wodValidateLog({level:'avanzado',scoreType:'rounds',rounds:'5',extraReps:'3'})).log].map(l=>[l.rounds,l.extraReps]),[[5,3]]);
  assert.strictEqual(J(W.wodValidateLog({level:'principiante',scoreType:'completed',completed:'partial'})).log.completed,'partial');
});
test('formato de resultados y diferencias',()=>{
  assert.strictEqual(W.wodFmtResult({scoreType:'time',timeSec:275}),'4:35');
  assert.strictEqual(W.wodFmtResult({scoreType:'time',capped:true,reps:85}),'TC · 85 reps');
  assert.strictEqual(W.wodFmtResult({scoreType:'rounds',rounds:5,extraReps:3}),'5 rondas + 3');
  assert.deepStrictEqual(J(W.wodDiff({scoreType:'time',timeSec:250},{scoreType:'time',timeSec:275})),{txt:'−0:25',better:true});
  assert.deepStrictEqual(J(W.wodDiff({scoreType:'reps',reps:110},{scoreType:'reps',reps:120})),{txt:'−10 reps',better:false});
  assert.strictEqual(W.wodDiff({scoreType:'reps',reps:1},{scoreType:'time',timeSec:1}),null);
});
test('progresión: busca el anterior parecido más reciente',()=>{
  const P=J(W.parseWodText(fx('wod-noviembre-2026-word.txt'),{ref:REF}));
  const wodOf=(date,id)=>{ for(const w of P.weeks) for(const d of w.days) if(d.date===date) return d.wods.find(x=>x.id===id)||null; return null; };
  const logs=[{date:'2026-11-09',wodId:'U',scoreType:'reps',reps:120},{date:'2026-11-16',wodId:'U',scoreType:'reps',reps:131},{date:'2026-11-18',wodId:'A',scoreType:'reps',reps:90}];
  const pairs=J(W.wodProgressPairs(logs,wodOf,'2026-11-01','2026-11-30'));
  assert.strictEqual(pairs.length,1);
  assert.deepStrictEqual([pairs[0].cur.date,pairs[0].prev.date,pairs[0].diff.txt],['2026-11-16','2026-11-09','+11 reps']);
});
test('firma de semana cambia con el contenido',()=>{
  const a=J(W.parseWodText('2/11\nB) WOD\nAMRAP 10\n- 5 Burpees',{ref:REF})).weeks[0].days;
  const b=J(W.parseWodText('2/11\nB) WOD\nAMRAP 10\n- 6 Burpees',{ref:REF})).weeks[0].days;
  assert.notStrictEqual(W.wodWeekSig(a),W.wodWeekSig(b)); assert.strictEqual(W.wodWeekSig(a),W.wodWeekSig(J(a)));
});
test('pertenencia al club: cuentas de otro club y cuentas nuevas de WOD',()=>{
  assert.strictEqual(W.wodStatusOf({club:'fuerza',status:'active'}),null);
  assert.strictEqual(W.wodStatusOf({club:'fuerza',status:'active',clubs:{wod:{status:'pending'}}}),'pending');
  assert.strictEqual(W.wodStatusOf({club:'wod',status:'active'}),'active');
  assert.strictEqual(W.wodTeacherListed({clubs:{wod:{status:'pending',roleRequest:'teacher'}}}),true);
});
console.log(passed+' tests del Club WOD');
