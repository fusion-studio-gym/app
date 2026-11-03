// Prueba de punta a punta del calendario del bloque, con Firestore SIMULADO (nunca toca la base real).
// Correr con: node tests/block-calendar.e2e.js   (SHOTS=carpeta para guardar capturas)
const fs=require('fs'), path=require('path'), assert=require('assert');
const {chromium}=require('playwright');
const {root,PLAN_JSON,HASH_1234,doc,val,openApp,listen,close,shot,noHScroll}=require('./helpers/e2e-harness');

const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Alumna',email:'ana@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
    coach:{id:'coach',name:'Coach',email:'coach@x.com',hash:HASH_1234,status:'active',club:'fuerza',admin:true}
  }),
  fs_plan_v1:{value:PLAN_JSON,updatedAt:1},
  fs_block_name_v1:doc('Bloque 4 - 2026'),
  fs_week_messages_v1:doc({0:'Mensaje semana 1',2:'Mensaje semana 3',4:'Mensaje semana 5'}),
  // Ana completó la semana 1 entera: sin calendario, su semana activa es la 2 (lógica de siempre)
};
const text=page=>page.evaluate(()=>document.body.innerText);
const setToday=(page,d)=>page.evaluate(d=>{ calDebugToday=d; render(); },d);

(async()=>{
  await listen();
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 0) Sin calendario: todo como antes (sin fechas ni aviso)
    let {page,errors}=await openApp(browser,db,'u1');
    let t=await text(page);
    assert.ok(!t.includes('Semana 1 de')&&!t.includes('2/11 –')&&!t.includes('PRÓXIMA'),'sin calendario no hay fechas');
    assert.ok(t.includes('● ACTIVA'));
    const legacy=await page.evaluate(()=>[getActiveWeek(),detectActiveWeek()]);
    assert.strictEqual(legacy[0],legacy[1],'sin calendario usa la lógica de siempre');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 1) Admin carga el calendario: elige un miércoles y se ajusta al lunes
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>openAdmin()); await page.waitForTimeout(300);
    await page.evaluate(()=>setAdminTab(3)); await page.waitForTimeout(400);
    t=await text(page);
    assert.ok(/calendario del bloque/i.test(t)&&t.includes('Sin fecha de inicio'));
    await page.locator('input[type=date]').first().fill('2026-11-04');
    await page.waitForTimeout(200);
    t=await text(page);
    assert.ok(t.includes('Elegiste un miércoles. Se ajustó al lunes 2/11.'),'aviso de ajuste a lunes');
    assert.ok(t.includes('28/12 – 3/1')&&t.includes('Hay cambios sin guardar'),'lista de semanas con fechas');
    await page.evaluate(()=>{ calDebugToday='2026-11-03'; renderModal(); });
    await shot(page,'cal-admin'); await noHScroll(page);
    await page.getByRole('button',{name:'Guardar calendario'}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    let cal=val(db,'fs_block_calendar_v1');
    assert.strictEqual(cal.startDate,'2026-11-02'); assert.strictEqual(cal.forcedWeek,null);
    assert.strictEqual(cal.updatedBy,'coach'); assert.strictEqual(cal.updatedByName,'Coach'); assert.ok(cal.updatedAt);
    assert.strictEqual(typeof db.fs_block_calendar_v1.value,'string','formato {value: JSON string}');
    // Dashboard: mensaje de la próxima semana = semana 2 (la siguiente a la activa por fecha)
    await page.evaluate(()=>setAdminTab(0)); await page.waitForTimeout(300);
    t=await text(page);
    assert.ok(t.includes('La Semana 2 todavía no tiene mensaje')&&t.includes('Semana activa: 1 (según la fecha)'),'tarjeta del dashboard');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 2) Alumna, martes 3/11: semana 1 activa, fechas y etiquetas
    ({page,errors}=await openApp(browser,db,'u1'));
    await setToday(page,'2026-11-03');
    t=await text(page);
    assert.ok(t.includes('Hoy martes 3 nov · Semana 1 de 9'),'aviso del día');
    assert.ok(t.includes('2/11 – 8/11')&&t.includes('9/11 – 15/11')&&t.includes('PRÓXIMA'),'rangos y etiquetas');
    assert.ok(/MENSAJE DEL PROFE · SEMANA 1/i.test(t),'mensaje de la semana activa');
    assert.ok(!t.includes('TERMINADA'));
    await shot(page,'cal-home'); await noHScroll(page);
    // Tocar otra semana no cambia la activa (está abierta igual)
    await page.locator('.week-card').nth(2).click(); await page.waitForTimeout(200);
    t=await text(page);
    assert.ok(t.includes('Lun 16 nov o Mar 17 nov')&&t.includes('Vie 20 nov o Sáb 21 nov'),'fechas de los días de la semana 3');
    await page.evaluate(()=>nav('home')); await page.waitForTimeout(200);
    assert.ok(/MENSAJE DEL PROFE · SEMANA 1/i.test(await text(page)),'la activa sigue siendo la 1');
    // Semana 1: el Día 1 es hoy
    await page.locator('.week-card').first().click(); await page.waitForTimeout(200);
    t=await text(page);
    assert.ok(t.includes('Lun 2 nov o Mar 3 nov')&&t.includes('Mié 4 nov o Jue 5 nov'),'fechas de los días');
    assert.strictEqual(await page.locator('.day-card .badge-active').count(),1,'un solo día marcado Hoy');
    assert.ok((await page.locator('.day-card').first().innerText()).includes('Hoy'));
    await shot(page,'cal-week'); await noHScroll(page);
    await page.evaluate(()=>nav('home'));
    // Semana 3 en curso: anteriores TERMINADA
    await setToday(page,'2026-11-18');
    t=await text(page);
    assert.ok(t.includes('Hoy miércoles 18 nov · Semana 3 de 9')&&t.includes('TERMINADA')&&/MENSAJE DEL PROFE · SEMANA 3/i.test(t));
    // Antes del inicio y después del final
    await setToday(page,'2026-11-01');
    assert.ok((await text(page)).includes('Tu bloque arranca el lunes 2/11 · falta 1 día'));
    await setToday(page,'2026-10-29');
    assert.ok((await text(page)).includes('faltan 4 días'));
    await setToday(page,'2027-01-04');
    t=await text(page);
    assert.ok(t.includes('Bloque finalizado')&&!t.includes('● ACTIVA'));
    assert.deepStrictEqual(errors,[]); await page.close();

    // 3) Admin fija la semana 5
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>openAdmin()); await page.waitForTimeout(300);
    await page.evaluate(()=>setAdminTab(3)); await page.waitForTimeout(400);
    await page.locator('select.adm-inp').first().selectOption('5'); await page.waitForTimeout(200);
    await page.getByRole('button',{name:'Guardar calendario'}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_block_calendar_v1').forcedWeek,5);
    // Planificación de profes: arranca en la semana activa
    await page.evaluate(()=>{ staffState.week=null; setAdminTab(12); }); await page.waitForTimeout(400);
    assert.ok((await text(page)).includes('Semana 5: 30/11 – 6/12 (activa)'),'Planificación en la semana activa');
    await page.close();
    ({page,errors}=await openApp(browser,db,'u1'));
    await setToday(page,'2026-11-03');
    t=await text(page);
    assert.ok(t.includes('Semana activa fijada por el profe · Semana 5 de 9')&&/MENSAJE DEL PROFE · SEMANA 5/i.test(t));
    assert.deepStrictEqual(errors,[]); await page.close();

    // 4) Publicar un bloque nuevo: el calendario viejo queda en el archivo y el nuevo toma la fecha del borrador
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ calDebugToday='2026-11-03'; openAdmin(); }); await page.waitForTimeout(300);
    await page.evaluate(()=>setAdminTab(9)); await page.waitForSelector('#draft-text');
    const example=fs.readFileSync(path.join(root,'bloque_ejemplo_9_semanas.txt'),'utf8');
    await page.evaluate(t=>{ const ta=document.getElementById('draft-text'); ta.value=t; fsDraftInput(t); },example);
    await page.waitForTimeout(500);
    await page.evaluate(()=>fsDraftSetStart('2027-01-06'));
    t=await text(page);
    assert.ok(t.includes('Elegiste un miércoles. Se ajustó al lunes 4/1.'),'ajuste en el borrador');
    await page.waitForTimeout(1200);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_draft_v1').startDate,'2027-01-04','fecha guardada en el borrador');
    await page.evaluate(()=>fsPublishDraft()); await page.waitForTimeout(1500);
    db=await page.evaluate(()=>window.__fakeDb);
    const bid=val(db,'fs_blocks_v1')[0].id;
    assert.deepStrictEqual(val(db,'fs_block_calendar_'+bid+'_v1').startDate,'2026-11-02','calendario archivado');
    cal=val(db,'fs_block_calendar_v1');
    assert.strictEqual(cal.startDate,'2027-01-04'); assert.strictEqual(cal.forcedWeek,null);
    // Pantalla del bloque archivado: rango de fechas
    await page.evaluate(async b=>{ closeAdmin(); blockSummaryState.open=false; await openArchivedBlock(b); },bid); await page.waitForTimeout(500);
    assert.ok((await text(page)).includes('2/11/2026 – 3/1/2027'),'rango del bloque archivado');
    await shot(page,'cal-archived');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 5) Publicar sin fecha en el borrador: se pide en la confirmación (sugerido: próximo lunes)
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ calDebugToday='2027-03-03'; openAdmin(); }); await page.waitForTimeout(300);
    await page.evaluate(()=>setAdminTab(9)); await page.waitForSelector('#draft-text');
    await page.evaluate(t=>{ const ta=document.getElementById('draft-text'); ta.value=t; fsDraftInput(t); },example.replace(/NOMBRE: .*/,'NOMBRE: Bloque 6 - 2027'));
    await page.waitForTimeout(500);
    await page.evaluate(()=>fsPublishDraft()); await page.waitForTimeout(1500);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_block_calendar_v1').startDate,'2027-03-08','próximo lunes sugerido');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 6) Las plantillas de bloque no guardan fechas
    assert.ok(!/startDate/.test(JSON.stringify(Object.keys(db).filter(k=>k.startsWith('fs_tpl')).map(k=>db[k]))));
    console.log('Calendario del bloque: OK');
  }catch(e){ console.error('FALLA', e); process.exitCode=1; }
  finally{ await browser.close(); close(); }
})();
