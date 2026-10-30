// Prueba de punta a punta de la Etapa 3 (plantillas de partes y editor de texto), con Firestore SIMULADO.
// Correr con: node tests/staff-templates.e2e.js   (SHOTS=carpeta para guardar capturas)
const assert=require('assert');
const {chromium}=require('playwright');
const {PLAN_JSON,HASH_1234,doc,val,openApp,listen,close,shot,noHScroll}=require('./helpers/e2e-harness');

const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Alumna',email:'ana@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
    t1:{id:'t1',name:'Caro Profe',email:'caro@x.com',hash:HASH_1234,status:'active',club:'fuerza',role:'teacher'},
    coach:{id:'coach',name:'Coach',email:'coach@x.com',hash:HASH_1234,status:'active',club:'fuerza',admin:true}
  }),
  fs_plan_v1:{value:PLAN_JSON,updatedAt:1},
  fs_block_name_v1:doc('Bloque 5 - 2026'),
  fs_templates_v1:doc([{id:'tpl_1',name:'Bloque viejo',createdAt:1,updatedAt:1,weeks:9}]),
};
const idx=db=>val(db,'fs_stpl_index_v1')||[];
const text=page=>page.evaluate(()=>document.body.innerText);

(async()=>{
  await listen();
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 1) Profesor: nueva plantilla desde un ejemplo, con vista previa en vivo
    let {page,errors}=await openApp(browser,db,'t1');
    await page.evaluate(()=>setTeacherTab('tpl')); await page.waitForTimeout(300);
    assert.ok((await text(page)).includes('Todavía no hay plantillas'));
    await page.getByRole('button',{name:'Nueva plantilla'}).click();
    for(const a of ['autocapitalize','autocorrect','spellcheck']) assert.strictEqual(await page.getAttribute('#stpl-text',a),a==='spellcheck'?'false':'off');
    await page.getByText('OTM remo y burpees',{exact:true}).click();
    let prev=await page.locator('#stpl-preview').innerText();
    assert.ok(prev.toUpperCase().includes('OTM · 6 MIN, MINUTO A MINUTO')&&prev.includes('Min 1')&&prev.includes('10 CAL REMO')&&/Cardio/i.test(prev),'vista previa OTM');
    await shot(page,'stpl-editor'); await noHScroll(page);
    // Vista previa en vivo al tipear
    await page.fill('#stpl-text',"CATEGORIA: Cardio\nNOMBRE: OTM remo y burpees\nPARTE: FINALIZADOR\nFORMATO: OTM 12'\nMIN 1: 10 CAL REMO\nMIN 2: 8 BURPEES");
    await page.waitForTimeout(400);
    prev=await page.locator('#stpl-preview').innerText();
    assert.ok(/12 min\. Los finalizadores suelen ser de 4 a 8 min/.test(prev),'advertencia en vivo');
    await page.getByRole('button',{name:'Guardar'}).click(); await page.waitForTimeout(300);   // la advertencia no bloquea
    db=await page.evaluate(()=>window.__fakeDb);
    let list=idx(db);
    assert.strictEqual(list.length,1); assert.strictEqual(list[0].cat,'Cardio'); assert.strictEqual(list[0].updatedByName,'Caro Profe');
    const otmId=list[0].id, otm=val(db,'fs_stpl_'+otmId);
    assert.strictEqual(otm.createdBy,'t1'); assert.ok(otm.text.includes("OTM 12'"));
    // Corregir y guardar de nuevo
    await page.fill('#stpl-text',otm.text.replace("OTM 12'","OTM 6'")); await page.getByRole('button',{name:'Guardar'}).click(); await page.waitForTimeout(300);
    await page.getByRole('button',{name:'Volver a plantillas'}).click();
    // Otra de Movilidad, y duplicar la de Cardio
    await page.getByRole('button',{name:'Nueva plantilla'}).click();
    await page.getByText('Movilidad tren superior',{exact:true}).click();
    await page.getByRole('button',{name:'Guardar'}).click(); await page.waitForTimeout(300);
    await page.getByRole('button',{name:'Volver a plantillas'}).click();
    await page.evaluate(id=>stplDuplicate(id),otmId); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb); list=idx(db);
    assert.deepStrictEqual(list.map(t=>t.name).sort(),['Movilidad tren superior','OTM remo y burpees','OTM remo y burpees (copia)']);
    // Chips de categoría
    await page.locator('.admin-tab',{hasText:'Movilidad'}).click();
    let t=await text(page);
    assert.ok(t.includes('Movilidad tren superior')&&!t.includes('OTM remo'),'filtro por categoría');
    await page.locator('.admin-tab',{hasText:'Todas'}).click();
    await shot(page,'stpl-lista'); await noHScroll(page);
    // Eliminar la copia (con confirmación)
    const copyId=list.find(x=>x.name.includes('(copia)')).id;
    await page.evaluate(id=>stplDelete(id),copyId); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(idx(db).length,2); assert.strictEqual(val(db,'fs_stpl_'+copyId),null);

    // 2) Planificación: "Elegir plantilla" en Cardio copia el texto (tplId de referencia)
    await page.evaluate(()=>{ setTeacherTab('plan'); staffSetWeek(0); }); await page.waitForTimeout(400);
    const cardioCard=page.locator('.ex-edit-card',{hasText:'CARDIO'}).last();
    await cardioCard.getByRole('button',{name:'Elegir plantilla'}).click(); await page.waitForTimeout(300);
    t=await cardioCard.innerText();
    assert.ok(t.includes('OTM remo y burpees')&&!t.includes('Movilidad tren superior'),'el selector muestra solo Cardio');
    await cardioCard.getByRole('button',{name:/OTM remo y burpees/}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    let part=val(db,'fs_staff_parts_w1_v1').days.d1.cardio;
    assert.strictEqual(part.tplId,otmId); assert.strictEqual(part.text,val(db,'fs_stpl_'+otmId).text); assert.strictEqual(part.byName,'Caro Profe');
    t=await page.locator('.ex-edit-card',{hasText:'CARDIO'}).last().innerText();
    assert.ok(t.toUpperCase().includes('OTM · 6 MIN')&&t.includes('Editado por Caro Profe'),'la parte se dibuja con el parser');
    // Editar la parte NO cambia la plantilla; vista previa en vivo en el editor de la parte
    await page.locator('.ex-edit-card',{hasText:'CARDIO'}).last().getByRole('button',{name:'Editar'}).click();
    await page.fill('#staff-edit-ta',part.text+'\nMIN 3: 12 AIR SQUATS'); await page.waitForTimeout(400);
    assert.ok((await page.locator('#staff-edit-preview').innerText()).includes('12 AIR SQUATS'));
    await shot(page,'staff-editor-parte');
    await page.getByRole('button',{name:'Guardar'}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.ok(val(db,'fs_staff_parts_w1_v1').days.d1.cardio.text.includes('MIN 3'));
    assert.ok(!val(db,'fs_stpl_'+otmId).text.includes('MIN 3'),'la plantilla no cambió');
    // 3) "Usar" desde la lista: elegir la parte en Planificación
    const movId=idx(db).find(x=>x.cat==='Movilidad').id;
    await page.evaluate(()=>setTeacherTab('tpl')); await page.waitForTimeout(300);
    await page.locator('.ath-card',{hasText:'Movilidad tren superior'}).getByRole('button',{name:'Usar'}).click(); await page.waitForTimeout(300);
    assert.ok((await text(page)).includes('Elegí la parte'),'banner de Usar');
    await shot(page,'stpl-usar');
    await page.locator('.cc-item',{hasText:'Elegí la parte'}).getByRole('button',{name:'Movilidad'}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_staff_parts_w1_v1').days.d1.mov.tplId,movId);
    await shot(page,'staff-planificacion-parser');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 4) Admin: Plantillas con dos secciones; Bloques completos igual que antes
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ openAdmin(); setAdminTab(10); }); await page.waitForTimeout(400);
    let adm=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(adm.includes('Bloques completos')&&adm.includes('Partes de clase')&&adm.includes('Bloque viejo')&&/Plantillas de bloque/i.test(adm),'sección de bloques sin cambios');
    await page.locator('#modal-root .admin-tab',{hasText:'Partes de clase'}).click(); await page.waitForTimeout(300);
    adm=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(adm.includes('OTM remo y burpees')&&adm.includes('Editado por Caro Profe'),'el admin ve las plantillas de partes');
    await page.locator('#modal-root .ath-card',{hasText:'OTM remo'}).getByRole('button',{name:'Editar'}).click(); await page.waitForTimeout(300);
    await page.fill('#stpl-text',(await page.inputValue('#stpl-text')).replace('8 BURPEES','10 BURPEES'));
    await page.locator('#modal-root').getByRole('button',{name:'Guardar',exact:true}).click(); await page.waitForTimeout(300);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(idx(db).find(x=>x.id===otmId).updatedByName,'Coach','último que edita');
    await shot(page,'admin-stpl'); await noHScroll(page);
    assert.deepStrictEqual(val(db,'fs_templates_v1'),val(seed,'fs_templates_v1'),'plantillas de bloque intactas');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 5) Alumna: nada de partes ni plantillas
    ({page,errors}=await openApp(browser,db,'u1'));
    await page.evaluate(()=>nav('day',{week:0,dayIdx:0}));
    t=await text(page);
    assert.ok(!t.includes('CAT-VACA')&&!t.includes('CAL REMO'),'la alumna no ve partes de clase');
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E plantillas de partes (Etapa 3): OK');
  }catch(e){ console.error('FALLA E2E plantillas de partes:',e.message); process.exitCode=1; }
  finally{ await browser.close(); close(); }
})();
