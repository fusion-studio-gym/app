// Prueba de punta a punta del Club WOD con un Firestore SIMULADO en memoria (nunca toca la base real).
// Cubre: selector con 3 clubes, cuenta nueva en WOD, cuenta de Fuerza que pide acceso, aprobación del Admin,
// borrador con la planificación de noviembre 2026, publicación por semana, alumno (Inicio, WOD, registro,
// Registros, popup), profesor (solo lectura) y que Fuerza/Hybrid sigan entrando igual.
// Correr con: node tests/wod.e2e.js   (SHOTS=carpeta para guardar capturas)
const assert=require('assert'), fs=require('fs'), path=require('path');
const {chromium}=require('playwright');
const {PLAN_JSON,HASH_1234,doc,val,openApp,listen,close,shot,noHScroll}=require('./helpers/e2e-harness');
const NOV0=fs.readFileSync(path.join(__dirname,'fixtures','wod-noviembre-2026-word.txt'),'utf8');

const seed={
  fs_users_v1:doc({
    f1:{id:'f1',name:'Fer Fuerza',email:'fer@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
    h1:{id:'h1',name:'Hybrid Uno',email:'h@x.com',hash:HASH_1234,status:'active',club:'hybrid'},
    t1:{id:'t1',name:'Tomi Profe',email:'tomi@x.com',hash:HASH_1234,status:'active',club:'wod',sex:'M',clubs:{wod:{status:'active',role:'teacher'}}}
  }),
  fs_plan_v1:{value:PLAN_JSON,updatedAt:1},
  fs_block_name_v1:doc('Bloque 5 - 2026'),
  // registro viejo (antes del campo libre "Resultado"): tiene que seguir mostrándose
  wod_logs_f1_v1:doc({logs:{'2026-11-23_B':{uid:'f1',date:'2026-11-23',weekId:'2026-11-23',wodId:'B',level:'avanzado',scoreType:'reps',reps:54,feeling:'duro',createdAt:1,updatedAt:1}}}),
};
const EXTRA='\n\nSEMANA 5\n\n30/11\nB) WOD\nAMRAP 12\'\n- 10 Burpees\n\n1/12\nB) WOD\nFOR TIME\n- 50 Wall Ball';
// La base simulada vive en cada página: se lee de ahí
const V=async(page,k)=>val(await page.evaluate(()=>window.__fakeDb),k);
async function adminLogin(page,pw){
  await page.evaluate(()=>openAdmin());
  await page.fill('#adm-pw-inp',pw||'wod2026');
  await page.evaluate(()=>checkAdminPw());
  await page.waitForFunction(()=>adminState.pwOk);
}
(async()=>{
  await listen();
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 1) Selector: aparecen los 3 clubes; WOD tiene logo y Orbitron
    let {page,errors}=await openApp(browser,db,null,{club:null});
    const picks=await page.locator('.club-pick-title').allInnerTexts();
    assert.strictEqual(picks.length,3); assert.ok(/WOD/.test(picks[2]));
    await shot(page,'wod-01-selector');
    await page.locator('.club-pick').nth(2).click();
    assert.ok(await page.evaluate(()=>document.body.classList.contains('wod-theme')));
    assert.ok((await page.locator('.auth-title').innerText()).includes('WOD'));
    // 2) Cuenta nueva en WOD: sin sexo no deja; con sexo queda pendiente
    await page.evaluate(()=>switchAuth('register'));
    await page.fill('#a-name','Lu Nueva'); await page.fill('#a-reg-email','lu@x.com');
    await page.fill('#a-reg-pw','123456'); await page.fill('#a-reg-pw2','123456');
    await page.evaluate(()=>{ authState.name='Lu Nueva'; authState.email='lu@x.com'; authState.pw='123456'; authState.pw2='123456'; });
    await page.evaluate(()=>doRegister());
    assert.ok((await page.locator('.auth-err').innerText()).includes('Mujer u Hombre'));
    await page.getByRole('button',{name:'Mujer'}).click();
    await shot(page,'wod-02-registro');
    await page.evaluate(()=>doRegister());
    await page.waitForFunction(()=>authState.mode==='login');
    let us=(await V(page,'fs_users_v1')); const lu=Object.values(us).find(u=>u.email==='lu@x.com');
    assert.deepStrictEqual([lu.club,lu.status,lu.sex,lu.clubs.wod.status],['wod','pending','F','pending']);
    // mismo email que una cuenta de Fuerza: no crea otra, manda a iniciar sesión
    await page.evaluate(()=>{ switchAuth('register'); Object.assign(authState,{name:'Fer',email:'fer@x.com',pw:'123456',pw2:'123456',sex:'M'}); });
    await page.evaluate(()=>doRegister());
    assert.ok((await page.locator('.auth-err').innerText()).includes('Ya tenés una cuenta'));
    // 3) Cuenta de Fuerza entra a WOD con el mismo usuario: pide sexo y deja la solicitud pendiente
    await page.evaluate(()=>{ switchAuth('login'); authState.email='fer@x.com'; authState.pw='1234'; });
    await page.evaluate(()=>doLogin());
    await page.waitForSelector('text=SUMATE AL CLUB WOD');
    await shot(page,'wod-03-sumate');
    await page.getByRole('button',{name:'Hombre'}).click();
    await page.evaluate(()=>wodConfirmJoin());
    await page.waitForSelector('text=CUENTA PENDIENTE');
    us=(await V(page,'fs_users_v1'));
    assert.deepStrictEqual([us.f1.club,us.f1.status,us.f1.sex,us.f1.clubs.wod.status],['fuerza','active','M','pending']);
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 4) Admin WOD: aprueba, pega noviembre, publica semanas 3 y 4
    ({page,errors}=await openApp(browser,db,null,{club:'wod',today:'2026-11-25'}));
    await adminLogin(page);
    assert.ok((await page.locator('.modal-title').innerText()).includes('WOD'));
    const tabs=await page.locator('.admin-nav .admin-tab').allInnerTexts();
    assert.deepStrictEqual(tabs.map(t=>t.trim()),['Dashboard','Alumnos','Profesores','Planificación','Borrador','Plantillas','Anuncio','Contraseña']);
    await page.waitForSelector('text=Solicitudes pendientes (2)');
    await page.waitForTimeout(400);
    await shot(page,'wod-04-dashboard');
    await page.evaluate(()=>wodApprove('f1')); await page.waitForTimeout(150);
    const luId=lu.id;
    await page.evaluate(id=>wodApprove(id),luId); await page.waitForTimeout(150);
    us=(await V(page,'fs_users_v1'));
    assert.strictEqual(us.f1.clubs.wod.status,'active'); assert.strictEqual(us.f1.status,'active');
    assert.strictEqual(us[luId].status,'active'); assert.strictEqual(us[luId].clubs.wod.status,'active');
    // Fuerza no ve a la alumna nueva del WOD
    assert.ok(!(await page.evaluate(()=>Object.values(users).filter(u=>(u.club||'fuerza')==='fuerza').map(u=>u.email))).includes('lu@x.com'));
    await page.evaluate(()=>setAdminTab('borrador'));
    await page.waitForSelector('#wod-draft');
    await page.evaluate(t=>{ const ta=document.getElementById('wod-draft'); ta.value=t; wodDraftInput(t); },NOV0+EXTRA);
    await page.waitForTimeout(1200);
    assert.ok((await V(page,'wod_draft_v1')).text.includes('SEMANA 4'),'autoguardado');
    await page.evaluate(()=>wodSetDraftView('prev'));
    const weeks=await page.locator('.wod-week').count();
    assert.strictEqual(weeks,5);
    assert.ok(!(await page.locator('#wod-draft-prev').innerText()).includes('Errores'));
    await shot(page,'wod-05-borrador-preview');
    await noHScroll(page);
    await page.evaluate(()=>wodPublishWeek('2026-11-16')); await page.waitForTimeout(200);
    await page.evaluate(()=>wodPublishWeek('2026-11-23')); await page.waitForTimeout(200);
    await page.evaluate(()=>wodPublishWeek('2026-11-30')); await page.waitForTimeout(200);
    const idx=(await V(page,'wod_index_v1'));
    assert.deepStrictEqual(Object.keys(idx.weeks).sort(),['2026-11-16','2026-11-23','2026-11-30']);
    assert.deepStrictEqual(idx.weeks['2026-11-23'].days['2026-11-23'],{label:'FERIADO',n:2,sectors:['ESCALERA','JAULA'],partner:false});
    assert.ok(!(await V(page,'wod_week_2026-11-02_v1')),'semana 1 sin publicar: no existe para nadie');
    assert.ok((await page.locator('#wod-draft-prev').innerText()).includes('Publicada · sin cambios'));
    // Planificación: corregir un día queda registrado
    await page.evaluate(()=>setAdminTab('plan')); await page.waitForTimeout(300);
    assert.ok((await page.locator('.adm-main').innerText()).includes('SEMANA 4'));
    await page.evaluate(()=>wodPlanEdit('2026-11-25'));
    await page.evaluate(()=>{ wodPlanView.editText=wodPlanView.editText.replace('3/4/5 Wall Walk','4/5/6 Wall Walk'); });
    await page.evaluate(()=>wodPlanSaveDay()); await page.waitForTimeout(200);
    const wk=(await V(page,'wod_week_2026-11-23_v1'));
    const d25=wk.days.find(d=>d.date==='2026-11-25');
    assert.ok(d25.raw.includes('4/5/6 Wall Walk')); assert.ok(d25.editedAt); assert.strictEqual(wk.history[0].what,'Corrección del 25/11');
    await shot(page,'wod-06-planificacion');
    // Anuncio y plantilla
    await page.evaluate(()=>setAdminTab('anuncio')); await page.waitForTimeout(200);
    await page.evaluate(()=>{ wodAnnDraft={text:'El viernes 4/12 no hay clase.',expiresAt:'2026-12-04'}; return wodAnnPublish(); });
    assert.strictEqual((await V(page,'wod_announcement_v1')).text,'El viernes 4/12 no hay clase.');
    await page.evaluate(()=>setAdminTab('plantillas')); await page.waitForTimeout(200);
    await page.evaluate(()=>{ wodTplEdit={id:null,name:'Movilidad base',category:'Warm up',text:'MOVILIDAD - 2 RONDAS\n- 10 Buenos Días'}; return wodTplSave(); });
    assert.strictEqual((await V(page,'wod_templates_v1'))[0].name,'Movilidad base');
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 5) Alumno (Fer, hombre) el martes 24/11: hoy no hay WOD y mañana sí -> lo ve completo, sin registrar
    const sesF={uid:'f1',email:'fer@x.com',name:'Fer Fuerza',club:'wod'};
    ({page,errors}=await openApp(browser,db,null,{club:'wod',session:sesF,today:'2026-11-24'}));
    await page.waitForSelector('.wod-hello');
    let home=await page.locator('.page-tabbed').innerText();
    assert.ok(/WOD de mañana · Miércoles 25\/11/i.test(home)); assert.ok(home.includes('Ver WOD'));
    assert.ok(home.includes('El viernes 4/12 no hay clase.')); assert.ok(home.includes('Esta semana: 1 WOD'));
    const av=await page.evaluate(()=>{ const c=getComputedStyle(document.querySelector('.nav-avatar')); return [c.backgroundColor,c.borderTopColor,c.color]; });
    assert.deepStrictEqual(av,['rgb(0, 0, 0)','rgb(43, 53, 224)','rgb(124, 134, 255)'],'avatar negro con borde azul');
    await shot(page,'wod-07-inicio-manana');
    await page.evaluate(()=>wodTab('wod')); await page.waitForTimeout(300);
    let wodTxt=await page.locator('.page-tabbed').innerText();
    assert.ok(wodTxt.includes('Mañana · Miércoles 25/11')); assert.ok(wodTxt.includes('Vas a poder registrarlo el miércoles 25/11'));
    assert.strictEqual(await page.locator('button:has-text("Registrar WOD")').count(),0,'mañana no se registra');
    assert.strictEqual(await page.locator('.wod-seg2 button:has-text("Mañana")').count(),0,'sin WOD hoy no hay Hoy/Mañana');
    assert.ok(wodTxt.includes('4/5/6')&&wodTxt.includes('Wall Walk'),'ve la corrección'); assert.ok(!wodTxt.includes('Iso Sled Push'),'no ve el warm up');
    // "Ver pesos de": Hombre + última categoría registrada (Avanzado) -> Deadlift H avanzado 80 kg
    assert.deepStrictEqual(await page.locator('.wod-vp .on').allInnerTexts(),['Hombre','Avanz.']);
    assert.ok((await page.locator('.wb-row:has-text("Deadlift")').first().innerText()).includes('80 kg'));
    await page.locator('.wod-vp button:has-text("Mujer")').click();
    assert.ok((await page.locator('.wb-row:has-text("Deadlift")').first().innerText()).includes('55 kg'));
    assert.ok((await page.locator('.wb-row:has-text("Sled")').first().innerText()).includes('80 / 100 kg'));
    await shot(page,'wod-08-wod-manana');
    await noHScroll(page);
    // calendario: mañana se abre con el aviso; pasado mañana no
    await page.evaluate(()=>wodTab('reg')); await page.waitForTimeout(400);
    await page.evaluate(()=>wodOpenDay('2026-11-25','f1',false)); await page.waitForSelector('#wod-sheet-root .summary-sheet');
    assert.ok((await page.locator('#wod-sheet-root').innerText()).includes('Vas a poder registrarlo'));
    assert.strictEqual(await page.locator('#wod-sheet-root button:has-text("Registrar")').count(),0);
    await page.evaluate(()=>wodCloseSheet());
    await page.evaluate(()=>wodOpenDay('2026-11-27','f1',false));
    assert.strictEqual(await page.locator('#wod-sheet-root').count(),0);
    // registro viejo con su resultado
    assert.ok((await page.locator('.page-tabbed').innerText()).includes('54 reps'));
    assert.ok(!(await page.locator('.page-tabbed').innerText()).includes('Sensación'));
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 5b) El mismo día (miércoles 25/11) aparece el formulario nuevo
    ({page,errors}=await openApp(browser,db,null,{club:'wod',session:sesF,today:'2026-11-25'}));
    await page.waitForSelector('.wod-hello');
    assert.ok(/WOD de hoy/i.test(await page.locator('.page-tabbed').innerText()));
    await page.evaluate(()=>wodTab('wod')); await page.waitForTimeout(300);
    await page.locator('button:has-text("Registrar WOD A")').click();
    assert.deepStrictEqual((await page.locator('.wod-form .wod-flabel').allInnerTexts()).map(x=>x.replace(/\s*\*$/,'').trim()),['Categoría en la que lo hiciste','Resultado','Kilos (opcional)','Notas personales']);
    assert.strictEqual(await page.locator('.wod-form .wod-chip.on').count(),0,'sin categoría preseleccionada');
    assert.strictEqual(await page.locator('.wod-form :text("Duro")').count(),0,'sin Sensación');
    assert.strictEqual(await page.locator('.wod-form input[placeholder="Ej: 6 rondas + 12, 14:32, 85 reps"]').count(),1);
    await page.locator('button:has-text("Guardar registro")').first().click();
    await page.waitForTimeout(100);
    assert.ok((await page.locator('#toast').innerText()).includes('categoría'),'sin categoría no guarda');
    await page.locator('.wod-form .wod-chip:has-text("Intermedio")').first().click();
    await page.locator('.wod-form input[placeholder^="Ej: 6 rondas"]').fill('132 reps');
    await page.locator('.wod-form input[placeholder^="Ej: PC"]').fill('DL 80');
    await page.locator('.wod-form textarea').fill('Bien de ritmo');
    await shot(page,'wod-09-registro');
    await page.locator('button:has-text("Guardar registro")').first().click();
    await page.waitForTimeout(300);
    let logs=(await V(page,'wod_logs_f1_v1')).logs;
    const la=logs['2026-11-25_A'];
    assert.deepStrictEqual([la.level,la.resultText,la.kgText,la.notes,la.feeling],['intermedio','132 reps','DL 80','Bien de ritmo',undefined]);
    // popup de un día anterior: registro viejo visible y registrar el WOD A olvidado
    await page.evaluate(()=>wodTab('reg')); await page.waitForTimeout(400);
    await page.evaluate(()=>wodOpenDay('2026-11-23','f1',false)); await page.waitForSelector('#wod-sheet-root .summary-sheet');
    assert.ok((await page.locator('#wod-sheet-root').innerText()).includes('54 reps'));
    await page.locator('#wod-sheet-root button:has-text("Ver tabla completa de pesos")').click();
    assert.strictEqual((await page.locator('#wod-sheet-root tr.pick th').first().innerText()).trim(),'Hombres avanzado');
    await page.locator('#wod-sheet-root button:has-text("Registrar WOD A")').click();
    await page.locator('#wod-sheet-root .wod-form .wod-chip:has-text("Rx")').click();
    await page.locator('#wod-sheet-root input[placeholder^="Ej: 6 rondas"]').fill('8 rondas');
    await page.locator('#wod-sheet-root button:has-text("Guardar registro")').click();
    await page.waitForTimeout(300);
    logs=(await V(page,'wod_logs_f1_v1')).logs;
    assert.deepStrictEqual([logs['2026-11-23_A'].resultText,logs['2026-11-23_A'].level],['8 rondas','rx']);
    assert.strictEqual(logs['2026-11-23_B'].reps,54,'el registro viejo no se toca');
    await shot(page,'wod-10-popup');
    await page.evaluate(()=>wodCloseSheet());
    const reg=await page.locator('.page-tabbed').innerText();
    assert.ok(reg.includes('Lunes 23/11') && reg.includes('8 rondas') && reg.includes('132 reps'));
    assert.strictEqual(await page.locator('.wod-cal-d.logged').count(),2);
    await shot(page,'wod-11-registros');
    await noHScroll(page);
    await page.evaluate(()=>wodTab('home')); await page.waitForTimeout(300);
    home=await page.locator('.page-tabbed').innerText();
    assert.ok(home.includes('Esta semana: 3 WODs')); assert.ok(/racha\s*1 semana/i.test(home));
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 5c) Lunes 30/11: hay WOD hoy y mañana -> Hoy / Mañana
    ({page,errors}=await openApp(browser,db,null,{club:'wod',session:sesF,today:'2026-11-30'}));
    await page.waitForSelector('.wod-hello');
    await page.evaluate(()=>wodTab('wod')); await page.waitForTimeout(300);
    assert.deepStrictEqual(await page.locator('.wod-seg2 button').allInnerTexts(),['Hoy','Mañana']);
    assert.strictEqual(await page.locator('button:has-text("Registrar WOD")').count(),1);
    await page.locator('.wod-seg2 button:has-text("Mañana")').click();
    assert.ok((await page.locator('.page-tabbed').innerText()).includes('Vas a poder registrarlo el martes 1/12'));
    assert.strictEqual(await page.locator('button:has-text("Registrar WOD")').count(),0);
    await shot(page,'wod-12-hoy-manana');
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 6) Profesor: ve warm up, no ve registros, no abre el admin
    ({page,errors}=await openApp(browser,db,null,{club:'wod',session:{uid:'t1',email:'tomi@x.com',name:'Tomi Profe',club:'wod',role:'teacher'},today:'2026-11-25'}));
    await page.waitForSelector('.wod-day');
    const tTxt=await page.locator('.page-tabbed').innerText();
    assert.ok(tTxt.includes('WARM UP')); assert.ok(tTxt.includes('Iso Sled Push'));
    assert.ok(!tTxt.includes('Corregir'),'el profesor no edita');
    assert.strictEqual(await page.locator('.tab-bar').count(),0);
    await page.evaluate(()=>openAdmin());
    assert.strictEqual(await page.locator('#modal-root .modal').count(),0);
    await shot(page,'wod-13-profesor');
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 7) Admin ve los registros de un alumno desde el Dashboard
    ({page,errors}=await openApp(browser,db,null,{club:'wod',today:'2026-11-25'}));
    await adminLogin(page);
    await page.evaluate(()=>wodAdmOpenUser('f1')); await page.waitForTimeout(400);
    const aTxt=await page.locator('.adm-main').innerText();
    assert.ok(aTxt.includes('Fer Fuerza')); assert.ok(aTxt.includes('132 reps'));
    assert.strictEqual(await page.locator('.adm-main button:has-text("Editar registro")').count(),0);
    await shot(page,'wod-14-admin-registros');
    // vista de escritorio y tablet: borrador lado a lado
    await page.setViewportSize({width:1024,height:768});
    await page.evaluate(()=>setAdminTab('borrador')); await page.waitForTimeout(400);
    const side=await page.evaluate(()=>{ const a=document.querySelector('.wod-split-ed').getBoundingClientRect(), b=document.querySelector('.wod-split-prev').getBoundingClientRect(); return b.left>a.left && Math.abs(a.top-b.top)<5; });
    assert.ok(side,'editor y vista previa lado a lado');
    await shot(page,'wod-15-borrador-tablet');
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 8) Fuerza y Hybrid siguen igual (mismo email/clave, sin tema WOD)
    ({page,errors}=await openApp(browser,db,null,{club:'fuerza'}));
    await page.evaluate(()=>{ authState.email='fer@x.com'; authState.pw='1234'; return doLogin(); });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(()=>session&&session.club),'fuerza');
    assert.ok(!(await page.evaluate(()=>document.body.classList.contains('wod-theme'))));
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();
    ({page,errors}=await openApp(browser,db,null,{club:'hybrid'}));
    await page.evaluate(()=>{ authState.email='h@x.com'; authState.pw='1234'; return doLogin(); });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(()=>session&&session.club),'hybrid');
    assert.ok(await page.evaluate(()=>document.body.classList.contains('hc-theme')));
    assert.deepStrictEqual(errors,[]);
    db=await page.evaluate(()=>window.__fakeDb); await page.close();
    console.log('E2E Club WOD: OK');
  } catch(e){ console.error(e); process.exitCode=1; }
  finally{ await browser.close(); close(); }
})();
