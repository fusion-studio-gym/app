// Prueba de punta a punta de la Etapa 2 (partes de clase y vista Planificación), con Firestore SIMULADO.
// Correr con: node tests/staff-parts.e2e.js   (SHOTS=carpeta para guardar capturas)
const assert=require('assert');
const {chromium}=require('playwright');
const {PLAN_JSON,HASH_1234,doc,val,openApp,listen,close,shot,noHScroll}=require('./helpers/e2e-harness');

const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Alumna',email:'ana@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
    t1:{id:'t1',name:'Caro Profe',email:'caro@x.com',hash:HASH_1234,status:'active',club:'fuerza',role:'teacher'},
    t2:{id:'t2',name:'Dani Profe',email:'dani@x.com',hash:HASH_1234,status:'active',club:'fuerza',role:'teacher'},
    coach:{id:'coach',name:'Coach',email:'coach@x.com',hash:HASH_1234,status:'active',club:'fuerza',admin:true}
  }),
  fs_plan_v1:{value:PLAN_JSON,updatedAt:1},
  fs_block_name_v1:doc('Bloque 5 - 2026'),
  fs_prog_u1_v1:doc({w1d1bue1_s0:{weight:'100',notes:'',done:true},w1d2bue1_s0:{weight:'60',notes:'',done:true}}),
};
const W1='fs_staff_parts_w1_v1';
const MOV='1) CAT-VACA\n2 x 10\n2) WALL SLIDES\n2 x 12';

(async()=>{
  await listen();
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 0) La alumna antes de todo: guardar su porcentaje y PRs para comparar al final
    let {page,errors}=await openApp(browser,db,'u1');
    const before=await page.evaluate(()=>({pct:plan.map(w=>calcWeekPct(w)),prs:JSON.stringify(prs),sum:JSON.stringify(calcBlockSummary(plan,progress))}));
    db=await page.evaluate(()=>window.__fakeDb); await page.close();

    // 1) Profesor: Planificación con el orden fijo; edita Movilidad; no puede editar principal/accesorios
    ({page,errors}=await openApp(browser,db,'t1'));
    let txt=await page.evaluate(()=>document.body.innerText);
    const order=['MOVILIDAD','APROXIMACIONES','BLOQUE PRINCIPAL','ACCESORIOS','ZONA MEDIA','CARDIO'].map(t=>txt.toUpperCase().indexOf(t));
    assert.ok(order.every((v,i)=>v>0&&(i===0||v>order[i-1])),'orden fijo: '+order);
    assert.ok(txt.includes('Sin cargar')&&txt.includes('BANCO PLANO'),'principal desde el plan, partes sin cargar');
    assert.ok(!/kg|100/.test(txt.replace(/Bloque 5/,'')),'sin pesos de alumnos');
    assert.strictEqual(await page.locator('button:has-text("Editar")').count(),4,'4 botones Editar (solo partes de clase)');
    assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Editar en Semanas'),'sin acceso al editor del Admin');
    await page.locator('button:has-text("Editar")').first().click();
    await page.fill('#staff-edit-ta',MOV);
    await shot(page,'staff-editando');
    await page.getByRole('button',{name:'Guardar'}).click();
    await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    let w1=val(db,W1);
    assert.strictEqual(w1.week,1); assert.strictEqual(w1.days.d1.mov.text,MOV);
    assert.strictEqual(w1.days.d1.mov.by,'t1'); assert.strictEqual(w1.days.d1.mov.byName,'Caro Profe');
    txt=await page.evaluate(()=>document.body.innerText);
    assert.ok(txt.includes('Editado por Caro Profe'),'muestra quién editó');
    // Los permisos también se respetan llamando directo a la función de guardado
    assert.strictEqual(await page.evaluate(()=>saveStaffPart(1,'d1','main','x')),false,'profesor no edita el principal');
    await shot(page,'staff-planificacion'); await noHScroll(page);
    assert.deepStrictEqual(errors,[]);

    // 2) Edición simultánea: otro profesor (con la semana ya abierta) guarda Cardio; luego Caro guarda Zona media
    //    con su caché vieja -> no se pisan porque se relee antes de guardar
    let p2=await openApp(browser,db,'t2');
    await p2.page.evaluate(()=>saveStaffPart(1,'d1','cardio','REMO 10\''));
    const dbAfterDani=await p2.page.evaluate(()=>window.__fakeDb);
    await page.evaluate(d=>{ window.__fakeDb=d; },dbAfterDani);
    await page.evaluate(()=>saveStaffPart(1,'d1','zmedia','PLANCHA 30"'));
    // Misma parte: Dani pisa Movilidad, la versión de Caro queda en historial
    await p2.page.evaluate(d=>{ window.__fakeDb=d; },await page.evaluate(()=>window.__fakeDb));
    await p2.page.evaluate(()=>saveStaffPart(1,'d1','mov','MOV DE DANI'));
    db=await p2.page.evaluate(()=>window.__fakeDb);
    w1=val(db,W1);
    assert.strictEqual(w1.days.d1.cardio.text,"REMO 10'"); assert.strictEqual(w1.days.d1.zmedia.text,'PLANCHA 30"');
    assert.strictEqual(w1.days.d1.mov.text,'MOV DE DANI'); assert.strictEqual(w1.days.d1.mov.history[0].text,MOV);
    assert.deepStrictEqual(p2.errors,[]); await p2.page.close(); await page.close();

    // 3) Admin: tarjeta del Dashboard (próxima semana), Planificación, historial y Restaurar
    db['fs_staff_parts_w3_v1']=doc({week:3,days:{d1:{mov:{text:'x',by:'t1',byName:'Caro',at:'2026-10-30T10:00:00Z',history:[]}}}});
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>openAdmin()); await page.waitForTimeout(500);
    let dash=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(/Partes de clase de la próxima semana/i.test(dash)&&dash.includes('Semana 3: faltan cargar')&&/DÍA 1: Aproximaciones, Zona media, Cardio/.test(dash),'aviso de faltantes');
    await shot(page,'staff-dashboard');
    await page.evaluate(()=>{ staffState.week=null; localStorage.removeItem('fs_staff_ui_v1'); setAdminTab(12); window.__defWeek=staffCurWeekIdx(); staffSetWeek(0); });
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(()=>window.__defWeek),1,'el admin arranca en la semana activa del grupo');
    let adm=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(adm.includes('MOV DE DANI')&&adm.includes('Editado por Dani Profe'),'el admin ve las partes');
    assert.ok(adm.includes('Editar en Semanas'),'acceso directo al editor del plan');
    assert.strictEqual(await page.locator('#modal-root button:has-text("Editar"):not(:has-text("Semanas"))').count(),4);
    await page.locator('#modal-root button:has-text("Ver historial")').first().click();
    await shot(page,'staff-historial');
    await page.locator('#modal-root button:has-text("Restaurar")').first().click();
    await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    w1=val(db,W1);
    assert.strictEqual(w1.days.d1.mov.text,MOV,'restaurada la versión de Caro'); assert.strictEqual(w1.days.d1.mov.byName,'Coach');
    assert.strictEqual(w1.days.d1.mov.history[0].text,'MOV DE DANI');
    await noHScroll(page);
    // El profesor no ve "Restaurar" en el historial
    assert.deepStrictEqual(errors,[]); await page.close();
    ({page,errors}=await openApp(browser,db,'t1'));
    await page.locator('button:has-text("Ver historial")').first().click();
    assert.strictEqual(await page.locator('button:has-text("Restaurar")').count(),0,'profesor sin Restaurar');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 4) Alumna: no ve ninguna parte de clase y sus números no cambian
    ({page,errors}=await openApp(browser,db,'u1'));
    const after=await page.evaluate(()=>({pct:plan.map(w=>calcWeekPct(w)),prs:JSON.stringify(prs),sum:JSON.stringify(calcBlockSummary(plan,progress))}));
    assert.deepStrictEqual(after,before,'porcentajes, PRs y resumen iguales');
    for(const v of ['ws1','day']){ 
      if(v==='day') await page.evaluate(()=>nav('day',{week:0,dayIdx:0}));
      const t=await page.evaluate(()=>document.body.innerText);
      assert.ok(!t.includes('CAT-VACA')&&!t.includes('PLANCHA 30')&&!/Movilidad|Aproximaciones|Zona media/i.test(t),'la alumna no ve partes de clase ('+v+')');
    }
    assert.deepStrictEqual(errors,[]); await page.close();

    // 5) Archivar el bloque: las partes se copian al archivo y las activas quedan vacías
    ({page,errors}=await openApp(browser,db,'coach'));
    const bid=await page.evaluate(async()=>{ await loadUsers(); return archiveCurrentBlock('Bloque 5 - 2026'); });
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_staff_parts_'+bid+'_w1_v1').days.d1.cardio.text,"REMO 10'",'copia archivada');
    assert.ok(val(db,'fs_staff_parts_'+bid+'_w3_v1'),'semana 3 archivada');
    assert.strictEqual(val(db,W1),null,'semana activa vacía'); assert.strictEqual(val(db,'fs_staff_parts_w3_v1'),null);
    assert.deepStrictEqual(val(db,'fs_prog_u1_b'+bid+'_v1'),val(seed,'fs_prog_u1_v1'),'snapshot de progreso intacto');
    assert.deepStrictEqual(val(db,'fs_prog_u1_v1'),val(seed,'fs_prog_u1_v1'),'progreso intacto');
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E partes de clase (Etapa 2): OK');
  }catch(e){ console.error('FALLA E2E partes de clase:',e.message); process.exitCode=1; }
  finally{ await browser.close(); close(); }
})();
