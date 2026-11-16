// Prueba de punta a punta de "Semana pasada" en el día de entrenamiento, con Firestore SIMULADO (nunca toca la base real).
// Correr con: node tests/last-week.e2e.js   (SHOTS=carpeta para guardar capturas)
const path=require('path'), assert=require('assert');
const {chromium}=require('playwright');
const {HASH_1234,PLAN_JSON,doc,val,openApp,listen,close,shot,noHScroll}=require('./helpers/e2e-harness');

// Plan por defecto (9 semanas). Ids: w{sem}d{día}b{u|l}e{n}. Día 1 = Tren Superior (u) / Tren Inferior (l).
const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Alumna',email:'ana@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
    u2:{id:'u2',name:'Beto',email:'beto@x.com',hash:HASH_1234,status:'active',club:'fuerza'},
  }),
  fs_plan_v1:{value:PLAN_JSON,updatedAt:1},
  fs_prog_u1_v1:doc({
    // Semana 1: Día 1 y Día 2
    w1d1bue1_s0:{weight:'70',notes:'',done:true},
    w1d2bue1_s0:{weight:'40',notes:'',done:true},
    // Semana 2: solo Día 1 (el Día 2 no lo entrenó)
    w2d1bue1_s0:{weight:'80',notes:'se movió lento en la última repetición del día',done:true},
    w2d1bue1_s1:{weight:'82.5',notes:'',done:false},
    w2d1bue2_a_s0:{weight:'30',notes:'',done:true},
    w2d1bue3_a_s0:{weight:'',notes:'',done:true},
  }),
  // Otro alumno con pesos en la semana 2: nunca deben aparecer para Ana
  fs_prog_u2_v1:doc({w2d1bue1_s2:{weight:'999',notes:'',done:true}}),
};
const text=page=>page.evaluate(()=>document.body.innerText);
const go=(page,week,dayIdx,blockIdx=0)=>page.evaluate(([w,d,b])=>{ nav('workout',{week:w,dayIdx:d,blockIdx:b}); },[week,dayIdx,blockIdx]).then(()=>page.waitForTimeout(250));
const flat=s=>s.replace(/\s+/g,' ').trim();
const rowText=(page,k)=>page.locator('#sr_'+k).textContent().then(flat);

(async()=>{
  await listen();
  const browser=await chromium.launch();
  const db=JSON.parse(JSON.stringify(seed));
  try{
    let {page,errors}=await openApp(browser,db,'u1');

    // 1) Semana 3 · Día 1: usa la semana 2
    await go(page,2,0);
    let t=await text(page);
    assert.ok(t.includes('Semana pasada')&&t.includes('Modo Express'),'interruptor junto a Modo Express');
    assert.strictEqual(await page.locator('.lw-switch[role=switch][aria-checked=true]').count(),1,'activado por defecto');
    let r=await rowText(page,'w3d1bue1_s0');
    assert.ok(r.includes('↺ Sem. 2 · 80 kg ✓'),'etiqueta serie 1: '+r);
    assert.ok(r.includes('se movió lento'),'nota');
    r=await rowText(page,'w3d1bue1_s1');
    assert.ok(r.includes('↺ Sem. 2 · 82.5 kg')&&!r.includes('✓'),'sin ✓ si no estaba hecha: '+r);
    r=await rowText(page,'w3d1bue1_s2');
    assert.ok(r.includes('Sin registro')&&!r.includes('999'),'serie sin datos (y nunca datos de otro alumno)');
    // Combinado: parte a con peso; fondos hechos sin peso → no tocable
    assert.ok((await rowText(page,'w3d1bue2_a_s0')).includes('↺ Sem. 2 · 30 kg ✓'));
    assert.strictEqual(await page.locator('#sr_w3d1bue3_a_s0 button.lw-chip').count(),0,'sin peso: no es botón');
    assert.ok((await rowText(page,'w3d1bue3_a_s0')).includes('↺ Sem. 2 · sin peso ✓'));
    // La nota se recorta en una línea
    const noteOk=await page.evaluate(()=>{ const n=document.querySelector('#sr_w3d1bue1_s0 .lw-note'); return n.scrollWidth>=n.clientWidth && getComputedStyle(n).whiteSpace==='nowrap' && getComputedStyle(n).textOverflow==='ellipsis'; });
    assert.ok(noteOk,'nota en una línea con puntos suspensivos');
    await shot(page,'lw-semana3'); await noHScroll(page);
    // Variante: el ejercicio cambió y no es el mismo ejercicio base → aviso amarillo solo en la primera serie
    await page.evaluate(()=>{ plan[2].days[0].blocks[0].exercises[2].parts[0].name='FONDOS EN PARALELAS'; render(); }); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('.lw-var').count(),1,'un solo aviso');
    assert.strictEqual(flat(await page.locator('#sr_w3d1bue3_a_s0 .lw-var').textContent()),'Sem. 2 fue: FONDOS EN BANCO O PARALELAS');
    assert.strictEqual(await page.locator('.lw-var').evaluate(e=>getComputedStyle(e).color),'rgb(245, 158, 11)');
    await page.evaluate(()=>{ plan[2].days[0].blocks[0].exercises[2].parts[0].name='FONDOS EN BANCO O PARALELAS'; render(); });

    // 2) Tocar la etiqueta con el casillero vacío copia el peso (y guarda + PRs, como al escribir)
    const chip=page.locator('#sr_w3d1bue1_s0 button.lw-chip');
    assert.ok(/Tocar para copiar/.test(await chip.getAttribute('aria-label')));
    await page.evaluate(()=>{ window.__recalcs=0; const f=recalcPrsFromProgress; window.recalcPrsFromProgress=function(){ window.__recalcs++; return f.apply(this,arguments); }; });
    await chip.click(); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#sr_w3d1bue1_s0 .inp-kg').inputValue(),'80');
    let st=await page.evaluate(()=>({p:progress.w3d1bue1_s0,n:window.__recalcs}));
    assert.deepStrictEqual(st.p,{weight:'80',notes:'',done:false},'no marca hecha ni copia la nota');
    assert.strictEqual(st.n,1,'PRs recalculados igual que al escribir');
    assert.ok((await chip.textContent()).includes('usado')&&await chip.evaluate(b=>b.classList.contains('used')));
    let saved=val(await page.evaluate(()=>window.__fakeDb),'fs_prog_u1_v1');
    assert.strictEqual(saved.w3d1bue1_s0.weight,'80','guardado en la base (simulada)');
    await shot(page,'lw-usado');
    // Tocar de nuevo: lo borra (todavía es el mismo valor copiado)
    await chip.click(); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#sr_w3d1bue1_s0 .inp-kg').inputValue(),'');
    assert.strictEqual(await page.evaluate(()=>progress.w3d1bue1_s0.weight),'');
    assert.ok(!(await chip.textContent()).includes('usado'));
    // Casillero ya escrito por el alumno: no lo pisa
    await page.locator('#sr_w3d1bue1_s1 .inp-kg').fill('90');
    await page.locator('#sr_w3d1bue1_s1 button.lw-chip').click(); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#sr_w3d1bue1_s1 .inp-kg').inputValue(),'90');
    assert.strictEqual(await page.evaluate(()=>progress.w3d1bue1_s1.weight),'90');
    // Copiado y después cambiado a mano: tocar no lo borra
    await page.locator('#sr_w3d1bue2_a_s0 button.lw-chip').click(); await page.waitForTimeout(100);
    await page.locator('#sr_w3d1bue2_a_s0 .inp-kg').fill('32.5');
    await page.locator('#sr_w3d1bue2_a_s0 button.lw-chip').click(); await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(()=>progress.w3d1bue2_a_s0.weight),'32.5');
    // Foco visible con teclado
    await page.locator('#sr_w3d1bue1_s0 button.lw-chip').focus();
    assert.ok(await page.evaluate(()=>document.activeElement.matches('.lw-chip:focus-visible')?getComputedStyle(document.activeElement).outlineStyle==='solid':true));

    // 3) Semana 3 · Día 2: la semana 2 está vacía → usa la semana 1
    await go(page,2,1);
    r=await rowText(page,'w3d2bue1_s0');
    assert.ok(r.includes('↺ Sem. 1 · 40 kg ✓'),'Día 2 usa la semana 1: '+r);
    // Semana 3 · Día 3: nunca entrenó ese día → Sin registro
    await go(page,2,2);
    assert.ok((await text(page)).includes('Sin registro'));
    assert.strictEqual(await page.locator('button.lw-chip').count(),0);

    // 4) Semana 1: no muestra nada
    await go(page,0,0);
    assert.strictEqual(await page.locator('.lw-ref,.lw-chip').count(),0,'semana 1 sin etiquetas');

    // 5) Modo Express: misma etiqueta en versión compacta
    await go(page,2,0);
    await page.evaluate(()=>toggleExpressMode()); await page.waitForTimeout(250);
    t=flat(await page.locator('#xsr_w3d1bue1_s0').textContent());
    assert.ok(t.includes('↺ S2 · 80'),'express: '+t);
    assert.ok((await text(page)).includes('Semana pasada'),'interruptor también en Express');
    await page.locator('#xsr_w3d1bue1_s0 button.lw-chip').click(); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#xsr_w3d1bue1_s0 .express-kg-inp').inputValue(),'80');
    await shot(page,'lw-express'); await noHScroll(page);
    await page.evaluate(()=>toggleExpressMode()); await page.waitForTimeout(200);

    // 6) Apagar el interruptor: no se muestra nada y se recuerda en el dispositivo
    await page.locator('.lw-switch').click(); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('.lw-ref,.lw-chip').count(),0,'apagado: sin etiquetas');
    assert.strictEqual(await page.locator('.lw-switch[aria-checked=false]').count(),1);
    assert.strictEqual(await page.evaluate(()=>localStorage.getItem('fs_lastweek_u1')),'false');
    await page.reload(); await page.waitForFunction(()=>window.__fsCloudReady&&typeof plan!=='undefined'&&plan); await page.waitForTimeout(400);
    await go(page,2,0);
    assert.strictEqual(await page.locator('.lw-ref').count(),0,'sigue apagado después de recargar');
    await page.locator('.lw-switch').click(); await page.waitForTimeout(200);
    assert.ok(await page.locator('.lw-ref').count()>0,'se vuelve a prender');
    assert.deepStrictEqual(errors,[]);
    await page.close();

    // 7) Celular chico (320px): sin scroll horizontal y el casillero entra en pantalla
    ({page,errors}=await openApp(browser,db,'u1'));
    await page.setViewportSize({width:320,height:568});
    await go(page,2,0);
    await noHScroll(page);
    const box=await page.locator('#sr_w3d1bue1_s0').boundingBox();
    assert.ok(box.height<150,'alto de la serie con etiqueta y nota: '+box.height);
    const bar=await page.locator('.express-toggle-bar').boundingBox();
    assert.ok(bar.width<=320);
    await shot(page,'lw-320');
    assert.deepStrictEqual(errors,[]);
    console.log('ok: semana pasada de punta a punta');
  } finally { await browser.close(); close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
