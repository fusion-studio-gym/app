// Tests del Club WOD: parser de la planificación semanal y funciones puras (racha, registro, progresión).
// Caso real: planificación de noviembre 2026 (pegada como sale de Word y como sale de un PDF).
// Correr con: node tests/wod-parser.test.js
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const block=(a,b)=>{ const m=html.match(new RegExp('// <'+a+'>[\\s\\S]*?// </'+b+'>')); if(!m) throw new Error('No encontré <'+a+'>'); return m[0]; };
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const ctx={}; vm.createContext(ctx);
vm.runInContext([grabFn('hashStr'),block('block-calendar','block-calendar').replace(/function getBlockCalInfo[\s\S]*$/,''),block('wod-core','wod-core'),
  'this.W={parseWodText,wodStreak,wodWeekCount,wodValidateLog,wodFmtResult,wodSimilar,wodDiff,wodProgressPairs,wodBlocksToText,wodDriveWeeks,wodTableToLines,wodDocRef,wodPresent,wodApplyWeights,wodLinesFromText,wodCase,wodParseMove,wodCells,wodSexRow,wodDateLine,wodWeekSig,wodStatusOf,wodTeacherListed};'].join('\n'),ctx);
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
  test(kind+': WODs por día, partner, TC, sector y formato (badge)',()=>{
    const sum=dt=>day(dt).wods.map(w=>[w.id,w.partner,w.timeCap,w.sector,W.wodPresent(w).badge]);
    assert.deepStrictEqual(sum('2026-11-02'),[['U',false,'','','OTM']]);
    assert.deepStrictEqual(sum('2026-11-04'),[['A',false,"5'",'','Rondas'],['B',false,'','','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-06'),[['U',true,"35' / 40'",'','Rondas']]);
    assert.deepStrictEqual(sum('2026-11-09'),[['U',false,'','','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-11'),[['A',false,"16'",'ESCALERA','Escalera'],['B',false,'','JAULA','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-13'),[['U',true,'','','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-16'),[['U',false,'','','Intervalos']]);               // "B) WARM UP" mal tipeado
    assert.deepStrictEqual(sum('2026-11-18'),[['A',false,'','','Intervalos'],['B',false,'','','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-20'),[['U',true,"25' / 30' / 35'",'','For time']]);
    assert.deepStrictEqual(sum('2026-11-23'),[['A',false,"16'",'ESCALERA','Rondas'],['B',false,'','JAULA','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-25'),[['A',false,'','','Intervalos'],['B',false,'','','Intervalos']]);
    assert.deepStrictEqual(sum('2026-11-27'),[['U',true,"35' / 40'",'','For time']]);
  });
  // ---- Checklist de presentación (pesos según "Ver pesos de") ----
  const pres=(dt,i,view)=>{ const w=day(dt).wods[i]; return J(W.wodApplyWeights(W.wodPresent(w),w,view)); };
  const rows=P=>{ const out=[]; P.items.forEach(it=>{ if(it.k==='row') out.push(it); if(it.k==='note') it.rows.forEach(r=>out.push(r)); }); return out; };
  const rowOf=(P,name)=>rows(P).find(r=>r.name===name);
  test(kind+': 27/11 bloques con chip de peso y recuadro "al principio de cada bloque"',()=>{
    const P=pres('2026-11-27',0,{sex:'F',level:'rx'});
    const subs=P.items.filter(i=>i.k==='sub').map(i=>[i.txt,i.chips.map(c=>c.txt)]);
    assert.deepStrictEqual(subs,[['Bloque 1 · 4 rondas',['50 kg']],['Bloque 2 · 3 rondas',['45 kg']],['Bloque 3 · 2 rondas',['40 kg']],['Bloque 4 · 1 ronda',['35 kg']]]);
    const note=P.items.find(i=>i.k==='note');
    assert.strictEqual(note.txt,'Al principio de cada bloque deben completar');
    assert.deepStrictEqual(note.rows.map(r=>[r.reps,r.name,r.tags]),[['30 / 40','Pull Ups o T2B',['M / H','Dividen']]]);
    assert.deepStrictEqual(P.chips.map(c=>c.txt),["TC 35' / 40'",'Partner']);
    assert.strictEqual(P.name,'PARTNER WOD');
  });
  test(kind+': 25/11 WOD A: pesos M/H en el texto y "80 / 100 kg" en el Sled',()=>{
    let P=pres('2026-11-25',0,{sex:'M',level:'avanzado'});
    assert.deepStrictEqual(rowOf(P,'Deadlift').chips.map(c=>c.txt),['80 kg']);
    assert.strictEqual(rowOf(P,'Deadlift').reps,'4/6');
    assert.deepStrictEqual(rowOf(P,'mts Sled Push').chips.map(c=>c.txt),['100 / 120 kg']);
    P=pres('2026-11-25',0,{sex:'F',level:'principiante'});
    assert.deepStrictEqual(rowOf(P,'mts Sled Push').chips.map(c=>c.txt),['80 / 100 kg']);
    assert.deepStrictEqual(rowOf(P,'Deadlift').chips.map(c=>c.txt),['45 kg']);
    assert.ok(P.chips.some(c=>c.txt==="2' work x 1' rest · x6") && P.chips.some(c=>c.txt==='Alterno'));
    assert.ok(!P.items.some(i=>(i.txt||'').includes('Work')),'la línea de formato no se repite');
    assert.deepStrictEqual(rowOf(P,'mts Run').tags,['arrancando abajo']);
  });
  test(kind+': 23/11 WOD A: tabla por RONDA en la fila del Power Clean',()=>{
    const P=pres('2026-11-23',0,{sex:'F',level:'intermedio'});
    assert.deepStrictEqual(rowOf(P,'Power Clean').sub.map(x=>x.ab+' '+x.v),['R1-2 35','R3-4 35','R5-6 40','R7-8 45/50']);
    assert.deepStrictEqual(P.fallback,[]);
  });
  test(kind+': 13/11 tabla de dos columnas Front Rack Lunges / Thrusters',()=>{
    const P=pres('2026-11-13',0,{sex:'M',level:'rx'});
    assert.deepStrictEqual(rowOf(P,'Synchro Front Rack Lunges').chips.map(c=>c.txt),['50 kg']);
    assert.deepStrictEqual(rowOf(P,'Synchro Thrusters').chips.map(c=>c.txt),['45 kg']);
    assert.deepStrictEqual(P.fallback,[]);
  });
  test(kind+': 2/11 tabla por nivel (con X) y tabla de una columna en el Front Squat*',()=>{
    let P=pres('2026-11-02',0,{sex:'F',level:'rx'});
    assert.deepStrictEqual(rowOf(P,'BMU/Pull Ups/T2B/K2C').chips.map(c=>c.txt),['T2B/K2C: 4/6','BMU: 2/3']); // Pull Ups = X en Rx
    assert.deepStrictEqual(rowOf(P,'Front Squat').chips.map(c=>c.txt),['55 kg']);
    P=pres('2026-11-02',0,{sex:'M',level:'principiante'});
    assert.deepStrictEqual(rowOf(P,'BMU/Pull Ups/T2B/K2C').chips.map(c=>c.txt),['T2B/K2C: 8','Pull Ups: 8']);
    assert.deepStrictEqual(rowOf(P,'Front Squat').chips.map(c=>c.txt),['50/55 kg']);
    assert.strictEqual(P.badge,'OTM'); assert.deepStrictEqual(P.chips.map(c=>c.txt),["30'",'Alterno']);
  });
  test(kind+': una columna sin * -> "Tu peso" arriba; 6/11 PESO 1..4 en cada Parte',()=>{
    let P=pres('2026-11-09',0,{sex:'F',level:'avanzado'});
    assert.deepStrictEqual(P.top,[{label:'Tu peso',txt:'45/50 kg'}]);
    P=pres('2026-11-06',0,{sex:'M',level:'rx'});
    assert.deepStrictEqual(P.items.filter(i=>i.k==='sub'&&/^Parte/.test(i.txt)).map(i=>i.txt+' '+i.chips[0].txt),['Parte 1 60 kg','Parte 2 70 kg','Parte 3 75 kg','Parte 4 80 kg']);
  });
  test(kind+': 20/11 tabla por movimiento con "/" aplica a los dos',()=>{
    const P=pres('2026-11-20',0,{sex:'F',level:'intermedio'});
    assert.deepStrictEqual(['Deadlift','Hang Power Clean','Front Squat','Thrusters'].map(n=>rowOf(P,n).chips[0].txt),['45 kg','35 kg','35 kg','30 kg']);
  });
  test(kind+': mayúsculas a formato oración, siglas respetadas',()=>{
    const P=pres('2026-11-04',0,{sex:'F',level:'rx'});
    assert.ok(P.items.some(i=>i.k==='note'&&i.icon==='rest'&&/^Rest 8’ entre WODs – debe ser una pausa completa antes de prepararse para el WOD B$/.test(i.txt)));
    assert.ok(P.items.some(i=>i.k==='sub'&&i.txt==='For time'),'segunda parte: For time sin repetir el TC');
  });
  test(kind+': warm up con el mismo estilo (columnas WOD A / WOD B en orden)',()=>{
    const P=J(W.wodPresent({},{warm:true,lines:W.wodLinesFromText(day('2026-11-23').warmupText)}));
    assert.deepStrictEqual(P.items.filter(i=>i.k==='sub').map(i=>i.txt),['Movilidad · 2 rondas','WOD A · 3 rondas','WOD B · 3 rondas']);
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
  assert.deepStrictEqual(d.wods.map(w=>[w.id,w.sector,w.timeCap]),[['A','ESCALERA',"16'"],['B','JAULA','']]);
  const tb=d.wods[0].weightTables[0];
  assert.deepStrictEqual(tb.head,['RONDA 1 - 2','RONDA 3 - 4','RONDA 5 - 6','RONDA 7 - 8']);
  assert.deepStrictEqual(tb.rows.map(r=>r.label),['Mujeres principiante','Mujeres intermedio','Hombres Rx']);
});
test('letras mal puestas: "A) WOD" y "B) WARM UP" se leen por la palabra',()=>{
  const P=J(W.parseWodText('1/12\nB) WARM UP\n- 10 Squats\nA) WOD\nAMRAP 12\'\n- 10 Burpees',{ref:REF}));
  const d=P.weeks[0].days[0];
  assert.strictEqual(d.date,'2026-12-01'); assert.ok(d.warmupText.includes('Squats'));
  assert.deepStrictEqual(d.wods.map(w=>w.id),['U']);
});
test('REGISTRO: se ignora sin error ni advertencia',()=>{
  const P=J(W.parseWodText('2/12\nA) WARM UP\n- x\nB) WOD\nFOR TIME\nREGISTRO: rondas\n- 10 Burpees',{ref:REF}));
  assert.deepStrictEqual([P.errors,P.warnings],[[],[]]);
  assert.ok(!JSON.stringify(P.weeks[0].days[0].wods[0].contentLines).includes('REGISTRO'));
});
test('formato no reconocido: sin badge y sin advertencia',()=>{
  const P=J(W.parseWodText('3/12\nB) WOD\nCHIPPER LOCO\n- 10 Burpees',{ref:REF}));
  assert.deepStrictEqual(P.warnings,[]);
  assert.strictEqual(W.wodPresent(P.weeks[0].days[0].wods[0]).badge,null);
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
test('registro: solo la categoría es obligatoria; resultado en texto libre',()=>{
  assert.strictEqual(W.wodValidateLog({resultText:'14:32'}).ok,false);
  assert.deepStrictEqual(J(W.wodValidateLog({level:'rx',resultText:' 6 rondas + 12 ',kgText:'PC 40',notes:'bien'})).log,{level:'rx',resultText:'6 rondas + 12',kgText:'PC 40',notes:'bien'});
  assert.strictEqual(W.wodValidateLog({level:'intermedio'}).ok,true);
});
test('registros viejos: el resultado se arma con los campos anteriores',()=>{
  assert.strictEqual(W.wodFmtResult({resultText:'85 reps',scoreType:'time',timeSec:1}),'85 reps');
  assert.strictEqual(W.wodFmtResult({scoreType:'time',timeSec:872}),'14:32');
  assert.strictEqual(W.wodFmtResult({scoreType:'time',capped:true,reps:85}),'TC · 85 reps');
  assert.strictEqual(W.wodFmtResult({scoreType:'reps',reps:54}),'54 reps');
  assert.strictEqual(W.wodFmtResult({scoreType:'rounds',rounds:6,extraReps:12}),'6 rondas + 12');
  assert.deepStrictEqual(J(W.wodDiff({scoreType:'time',timeSec:250},{scoreType:'time',timeSec:275})),{txt:'−0:25',better:true});
  assert.strictEqual(W.wodDiff({resultText:'5 rondas'},{resultText:'4 rondas'}),null);
});
test('mayúsculas: formato oración con siglas; Title Case queda igual',()=>{
  assert.strictEqual(W.wodCase('SI ES NECESARIO, AGREGAR UN INTERVALO MÁS'),'Si es necesario, agregar un intervalo más');
  assert.strictEqual(W.wodCase('30 PULL UPS / T2B CON KBs Y DBs EN EL WOD'),'30 pull ups / T2B con KBs y DBs en el WOD');
  assert.strictEqual(W.wodCase('RowErg o Bike'),'RowErg o Bike');
  assert.strictEqual(W.wodCase('DU O SU'),'DU o SU');
  assert.deepStrictEqual(J(W.wodParseMove('4 - 3 - 2 - 1 Clean and Jerk*')),{reps:'4 - 3 - 2 - 1',name:'Clean and Jerk',tags:[],star:true,iw:null,pre:null});
  assert.deepStrictEqual(J(W.wodParseMove('150/200 mts Row o 8/12 Cal Bike (ALTERNO UNA RONDA Y UNA)')).tags,['Alterno una ronda y una']);
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

// ---- Sincronización con Google Docs (respuesta del Apps Script simulada desde el .docx de noviembre) ----
const DRIVE=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','wod-noviembre-2026-drive.json'),'utf8'));
const DR=J(W.wodDriveWeeks(DRIVE,'2026-11-26'));
const dday=date=>{ for(const w of DR.weeks) for(const d of w.days) if(d.date===date) return d; return null; };
const dpres=(date,i,view)=>{ const w=dday(date).wods[i]; return J(W.wodApplyWeights(W.wodPresent(w),w,view)); };
const drows=P=>{ const out=[]; P.items.forEach(it=>{ if(it.k==='row') out.push(it); if(it.k==='note') it.rows.forEach(r=>out.push(r)); }); return out; };
const drow=(P,n)=>drows(P).find(r=>r.name===n);
test('drive: 4 semanas, 12 días, sin errores ni avisos; año por el nombre del documento',()=>{
  assert.deepStrictEqual(DR.errors,[]);
  assert.deepStrictEqual(DR.weeks.map(w=>[w.id,w.label,w.days.length]),[['2026-11-02','SEMANA 1',3],['2026-11-09','SEMANA 2',3],['2026-11-16','SEMANA 3',3],['2026-11-23','SEMANA 4',3]]);
  DR.weeks.forEach(w=>{ assert.deepStrictEqual([w.errors,w.warnings],[[],[]],w.id); assert.ok(w.textSig&&w.docs[0].url); });
  assert.strictEqual(W.wodDocRef('11. Planificación WOD Noviembre 2026','2027-05-01'),'2026-11-15');
  assert.strictEqual(W.wodDocRef('sin fecha','2027-05-01'),'2027-05-01');
});
test('drive: "WARM UP" / "WODs" como ítems de lista numerados (A) B)) abren las secciones',()=>{
  ['2026-11-09','2026-11-13','2026-11-20','2026-11-23','2026-11-25'].forEach(dt=>{ const d=dday(dt); assert.ok(/MOVILIDAD/.test(d.warmupText),dt); assert.ok(d.wods.length>=1,dt); assert.ok(!JSON.stringify(d.wods).includes('Activaciones'),dt); });
});
test('drive 2/11: tabla por nivel (X -> sin chip) y tabla de una columna en el Front Squat*',()=>{
  const d=dday('2026-11-02'); assert.deepStrictEqual(d.wods[0].weightTables.map(t=>t.kind),['level','sex']);
  assert.ok(d.warmupText.includes('3 RONDAS') && d.warmupText.includes('- 8 Dominadas Escapulares'),'recuadro de una columna aplanado');
  const P=dpres('2026-11-02',0,{sex:'F',level:'rx'});
  assert.deepStrictEqual(drow(P,'BMU/Pull Ups/T2B/K2C').chips.map(c=>c.txt),['T2B/K2C: 4/6','BMU: 2/3']);
  assert.deepStrictEqual(drow(P,'Front Squat').chips.map(c=>c.txt),['55 kg']);
  assert.deepStrictEqual(P.fallback,[]);
});
test('drive 6/11: estaciones como grilla genérica y PESO 1..4 en cada Parte',()=>{
  const w=dday('2026-11-06').wods[0];
  assert.deepStrictEqual(w.weightTables.map(t=>t.kind),['grid','sex']);
  assert.deepStrictEqual(w.weightTables[0].head,['4 RONDAS (2 c/u)','4 RONDAS (2 c/u)','4 RONDAS (2 c/u)']);
  const P=dpres('2026-11-06',0,{sex:'M',level:'rx'});
  assert.strictEqual(P.items.filter(i=>i.k==='grid').length,1);
  assert.ok(drow(P,'Synchro Run'),'fila combinada "300 Synchro Run" arriba de la grilla');
  assert.deepStrictEqual(P.items.filter(i=>i.k==='sub'&&/^Parte/.test(i.txt)).map(i=>i.txt+' '+i.chips[0].txt),['Parte 1 60 kg','Parte 2 70 kg','Parte 3 75 kg','Parte 4 80 kg']);
});
test('drive 13/11: dos columnas Front Rack Lunges / Thrusters',()=>{
  const P=dpres('2026-11-13',0,{sex:'F',level:'intermedio'});
  assert.deepStrictEqual(drow(P,'Synchro Front Rack Lunges').chips.map(c=>c.txt),['30 kg']);
  assert.deepStrictEqual(drow(P,'Synchro Thrusters').chips.map(c=>c.txt),['25 kg']);
  assert.ok(P.items.some(i=>i.k==='note'&&/^Al principio de cada intervalo/.test(i.txt)&&i.rows.length===2));
});
test('drive 20/11: tabla por movimiento ("Hang Power Clean / Front Squat" aplica a los dos)',()=>{
  const P=dpres('2026-11-20',0,{sex:'M',level:'avanzado'});
  assert.deepStrictEqual(['Deadlift','Hang Power Clean','Front Squat','Thrusters'].map(n=>drow(P,n).chips[0].txt),['65 kg','55 kg','55 kg','50 kg']);
  assert.ok(dday('2026-11-20').warmupText.includes('3 RONDAS c/u – EN FORMATO RELEVO'));
});
test('drive 23/11: activación WOD A / WOD B aplanada y tabla por RONDA (con subencabezado) en el Power Clean*',()=>{
  const d=dday('2026-11-23');
  assert.ok(/Activación WOD A\n3 RONDAS\n- 2 Deadlift/.test(d.warmupText) && /Activación WOD B\n3 RONDAS\n- 5 Balanceos Amplios/.test(d.warmupText));
  const tb=d.wods[0].weightTables[0];
  assert.deepStrictEqual([tb.head,tb.sub],[['RONDA 1 - 2','RONDA 3 - 4','RONDA 5 - 6','RONDA 7 - 8'],['4 REPS','3 REPS','2 REPS','1 REP']]);
  const P=dpres('2026-11-23',0,{sex:'F',level:'avanzado'});
  assert.deepStrictEqual(drow(P,'Power Clean').sub.map(x=>x.ab+' '+x.v),['R1-2 40','R3-4 45','R5-6 50','R7-8 55']);
  const WP=J(W.wodPresent({},{warm:true,lines:W.wodLinesFromText(d.warmupText)}));
  assert.deepStrictEqual(WP.items.filter(i=>i.k==='sub').map(i=>i.txt),['Movilidad · 2 rondas','Activación WOD A · 3 rondas','Activación WOD B · 3 rondas']);
});
test('drive 27/11: columnas vacías (celdas fusionadas) fuera, chips por bloque y recuadro "al principio de cada bloque"',()=>{
  const tb=dday('2026-11-27').wods[0].weightTables[0];
  assert.deepStrictEqual(tb.head,['BLOQUE 1','BLOQUE 2','BLOQUE 3','BLOQUE 4']); assert.strictEqual(tb.rows[0].cells.length,4);
  const P=dpres('2026-11-27',0,{sex:'F',level:'rx'});
  assert.deepStrictEqual(P.items.filter(i=>i.k==='sub').map(i=>[i.txt,i.chips.map(c=>c.txt)]),[['Bloque 1 · 4 rondas',['50 kg']],['Bloque 2 · 3 rondas',['45 kg']],['Bloque 3 · 2 rondas',['40 kg']],['Bloque 4 · 1 ronda',['35 kg']]]);
  const note=P.items.find(i=>i.k==='note');
  assert.strictEqual(note.txt,'Al principio de cada bloque deben completar');
  assert.deepStrictEqual(note.rows.map(r=>[r.reps,r.name,r.tags]),[['30 / 40','Pull Ups o T2B',['M / H','Dividen']]]);
});
test('drive: bugs que no pueden volver (encabezado como subtítulo, números sueltos, "Dividen" suelto, tabla doble)',()=>{
  DR.weeks.forEach(w=>w.days.forEach(d=>d.wods.forEach(x=>{
    const P=J(W.wodApplyWeights(W.wodPresent(x),x,{sex:'F',level:'intermedio'}));
    const tag=d.date+' '+x.id;
    P.items.filter(i=>i.k==='sub').forEach(i=>assert.ok(!/^(Peso|Ronda) \d/i.test(i.txt)&&!/^(Mujeres|Hombres)/.test(i.txt),tag+' subtítulo: '+i.txt));
    drows(P).forEach(r=>{ assert.ok(r.name||r.reps,tag+' fila vacía'); assert.ok(!(r.reps&&!r.name&&/^\d+([.,]\d+)?$/.test(r.reps)),tag+' número suelto'); assert.ok(r.name||!r.tags.length,tag+' etiqueta suelta'); });
    assert.ok(!drows(P).some(r=>/^(Mujeres|Hombres) /.test(r.name)),tag+' fila de tabla como movimiento');
    assert.strictEqual(x.contentLines.filter(l=>l.t==='table').length,x.weightTables.length,tag+' cada tabla una vez');
  })));
});
test('conversión de tablas: reglas',()=>{
  assert.deepStrictEqual(J(W.wodTableToLines([['','PESO 1','',''],['Mujeres Rx','40','',''],['','','','']])),['TABLA | PESO 1','Mujeres Rx | 40','FIN TABLA']);
  assert.deepStrictEqual(J(W.wodTableToLines([['3 RONDAS'],['5 Burpees\n20 Skipping']])),['3 RONDAS','- 5 Burpees','- 20 Skipping']);
  assert.deepStrictEqual(J(W.wodTableToLines([['Estación 1','Estación 2'],['10 Burpees\n5 Clean','20 Wall Ball']])),['TABLA GRILLA | Estación 1 | Estación 2','10 Burpees / 5 Clean | 20 Wall Ball','FIN TABLA']);
  assert.deepStrictEqual(J(W.wodTableToLines([['','Rx','Intermedio'],['Pull Ups','X','8']])),['TABLA NIVELES | Rx | Intermedio','Pull Ups | X | 8','FIN TABLA']);
});
console.log(passed+' tests del Club WOD');
