// Prueba de punta a punta del flujo Borrador -> Publicar, con un Firestore SIMULADO en memoria
// (nunca toca la base real). Requiere Playwright y Chromium.
// Correr con: node tests/publish.e2e.js
const fs=require('fs'), path=require('path'), http=require('http'), vm=require('vm'), assert=require('assert');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const ctx={}; vm.createContext(ctx);
vm.runInContext([grabFn('buildDefaultWeek'),grabFn('buildDefaultRoutine'),grabFn('hashStr'),'this.plan=JSON.stringify(buildDefaultRoutine());this.h=hashStr("1234");'].join('\n'),ctx);

const OLD='Bloque 4 - 2026', NEW='Bloque 5 - 2026';
const doc=v=>({value:JSON.stringify(v),updatedAt:1});
const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Test',email:'ana@x.com',hash:ctx.h,status:'active',club:'fuerza'},
    coach:{id:'coach',name:'Coach',email:'coach@x.com',hash:ctx.h,status:'active',club:'fuerza',admin:true}
  }),
  fs_plan_v1:{value:ctx.plan,updatedAt:1},
  fs_block_name_v1:doc(OLD),
  fs_week_messages_v1:doc({0:'Mensaje semana 1',1:'Mensaje semana 2'}),
  fs_prog_u1_v1:doc({
    w1d1bue1_s0:{weight:'100',notes:'',done:true},   // Banco Plano 6 reps -> PR 4RM+
    w1d2ble1_s0:{weight:'120',notes:'',done:true},   // Back Squat
    w2d1ble1_s0:{weight:'140',notes:'',done:true},   // Peso Muerto
  }),
};
const fakeApp='export function initializeApp(){ return {}; }';
const fakeStore=`
export function getFirestore(){ return {}; }
export function doc(db,col,key){ return {key}; }
export async function getDoc(ref){ const v=window.__fakeDb[ref.key]; return {exists:()=>v!==undefined&&v!==null, data:()=>v}; }
export async function setDoc(ref,data){ window.__fakeDb[ref.key]=JSON.parse(JSON.stringify(data)); }`;

const server=http.createServer((req,res)=>{
  const f=path.join(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html');
  if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript':'application/octet-stream'}); res.end(fs.readFileSync(f));
});

async function openApp(browser,db,sessionUid){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
  await page.route('**/*',r=>{
    const u=r.request().url();
    if(u.includes('firebase-app.js')) return r.fulfill({contentType:'text/javascript',body:fakeApp});
    if(u.includes('firebase-firestore.js')) return r.fulfill({contentType:'text/javascript',body:fakeStore});
    if(u.startsWith('http://localhost')) return r.continue();
    return r.abort();
  });
  await page.addInitScript(([db,uid])=>{
    window.__fakeDb=db;
    if(uid) localStorage.setItem('fs_session_v1',JSON.stringify({uid,email:uid+'@x.com',name:uid,club:'fuerza'}));
    localStorage.setItem('fs_club_v1',JSON.stringify('fuerza'));
  },[db,sessionUid]);
  await page.goto('http://localhost:'+server.address().port+'/index.html');
  await page.waitForFunction(()=>window.__fsCloudReady && typeof plan!=='undefined' && plan);
  await page.waitForTimeout(600);
  return {page,errors};
}
const val=(db,k)=>db[k]&&db[k].value!=null?JSON.parse(db[k].value):null;

(async()=>{
  await new Promise(r=>server.listen(0,r));
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 0) La alumna abre la app con el bloque viejo: se calculan sus PRs
    let {page,errors}=await openApp(browser,db,'u1');
    db=await page.evaluate(()=>window.__fakeDb);
    const prsBefore=val(db,'fs_prs_u1_v2');
    assert.strictEqual(prsBefore['Banco Plano'].rm4.weight,100,'PR inicial de banco');
    assert.ok(await page.evaluate(()=>document.body.innerText.includes('Mensaje semana 1')),'mensaje viejo visible');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 1) El coach escribe el borrador y lo publica
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ openAdmin(); });
    await page.waitForTimeout(300);
    await page.evaluate(()=>setAdminTab(9));
    await page.waitForSelector('#draft-text');
    // El plan activo no cambia mientras se escribe
    const example=fs.readFileSync(path.join(root,'bloque_ejemplo_9_semanas.txt'),'utf8');
    await page.fill('#draft-text',example);
    await page.waitForTimeout(1200); // autoguardado (800 ms)
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_draft_v1').text,example,'borrador autoguardado');
    assert.strictEqual(val(db,'fs_draft_v1').plan.length,9,'plan parseado guardado');
    // El plan activo solo pudo recibir la migración de mensajes (al entrar el admin), nada más
    const activeNow=val(db,'fs_plan_v1'), sinMsgs=p=>JSON.stringify(p.map(({message,...w})=>w));
    assert.ok(sinMsgs(activeNow)===seed.fs_plan_v1.value,'el plan activo no se tocó');
    assert.strictEqual(activeNow[0].message,'Mensaje semana 1','migración de mensajes al plan');
    // Vista previa: 9 semanas y el mensaje de la semana 1
    assert.strictEqual(await page.locator('#draft-preview details').count(),9);
    await page.locator('#draft-preview details').first().locator('summary').click();
    await page.locator('#draft-preview details').first().locator('textarea').fill('Arrancamos bloque nuevo');
    await page.waitForTimeout(1000);
    // Sin scroll horizontal a ancho de celular
    const overflow=await page.evaluate(()=>{ const m=document.querySelector('#modal-root .modal'); return [m.scrollWidth-m.clientWidth, document.documentElement.scrollWidth-document.documentElement.clientWidth]; });
    assert.deepStrictEqual(overflow,[0,0],'scroll horizontal en el Borrador');
    if(process.env.SHOTS) await page.screenshot({path:path.join(process.env.SHOTS,'borrador.png'),fullPage:false});
    if(process.env.SHOTS){ await page.evaluate(()=>document.querySelector('#draft-preview').scrollIntoView()); await page.screenshot({path:path.join(process.env.SHOTS,'borrador-preview.png')}); }
    // Sin cambiar el nombre no se puede publicar
    await page.evaluate(t=>{ const ta=document.getElementById('draft-text'); ta.value=t; fsDraftInput(t); },example.replace('NOMBRE: '+NEW,'NOMBRE: '+OLD));
    await page.waitForTimeout(400);
    assert.ok((await page.locator('#draft-issues').innerText()).includes('igual al del bloque activo'));
    await page.evaluate(t=>{ const ta=document.getElementById('draft-text'); ta.value=t; fsDraftInput(t); },example);
    await page.waitForTimeout(400);
    await page.evaluate(()=>fsPublishDraft());
    await page.waitForFunction(n=>currentBlockName===n,NEW);
    // Al publicar se abre el resumen del bloque ANTERIOR (igual que al archivar a mano)
    await page.waitForFunction(()=>blockSummaryState.open);
    const sum=await page.evaluate(()=>({open:blockSummaryState.open,name:blockSummaryState.blockName,bid:blockSummaryState.blockId,weeks:blockSummaryState.blockPlan.length,sheet:!!document.querySelector('.summary-sheet')}));
    assert.strictEqual(sum.open,true,'resumen abierto al publicar');
    assert.strictEqual(sum.name,OLD,'el resumen es del bloque archivado, no del nuevo');
    assert.ok(sum.sheet,'hoja de resumen visible');
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(sum.bid,val(db,'fs_blocks_v1')[0].id,'resumen del bloque recién archivado');
    assert.strictEqual(sum.weeks,JSON.parse(seed.fs_plan_v1.value).length,'resumen con el plan viejo');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 2) Verificaciones en la "base"
    const blocks=val(db,'fs_blocks_v1');
    assert.strictEqual(blocks.length,1); assert.strictEqual(blocks[0].name,OLD);
    const bid=blocks[0].id;
    const archived=val(db,'fs_plan_'+bid);
    assert.strictEqual(archived[0].days[0].blocks[0].exercises[0].id,'w1d1bue1','plan viejo archivado');
    assert.strictEqual(archived[0].message,'Mensaje semana 1','mensajes viajan con el bloque archivado');
    assert.deepStrictEqual(val(db,'fs_prog_u1_b'+bid+'_v1'),val(seed,'fs_prog_u1_v1'),'snapshot de progreso');
    assert.deepStrictEqual(val(db,'fs_prs_u1_b'+bid+'_v1'),prsBefore,'snapshot de PRs');
    assert.deepStrictEqual(val(db,'fs_prog_u1_v1'),val(seed,'fs_prog_u1_v1'),'progreso del alumno intacto');
    assert.strictEqual(val(db,'fs_plan_backup_v1').name,OLD,'copia de seguridad');
    const newPlan=val(db,'fs_plan_v1');
    assert.strictEqual(newPlan.length,9);
    assert.ok(/^b[0-9a-z]+w1d1bue1$/.test(newPlan[0].days[0].blocks[0].exercises[0].id),'IDs con prefijo');
    assert.strictEqual(newPlan[0].message,'Arrancamos bloque nuevo');
    assert.strictEqual(newPlan[1].message,'');
    assert.strictEqual(val(db,'fs_block_name_v1'),NEW);
    assert.strictEqual(val(db,'fs_draft_v1'),null,'borrador limpio');
    assert.deepStrictEqual(val(db,'fs_week_messages_v1'),{0:'Arrancamos bloque nuevo'},'espejo de mensajes');

    // 3) La alumna vuelve a entrar: bloque nuevo limpio, PRs viejos conservados
    ({page,errors}=await openApp(browser,db,'u1'));
    const st=await page.evaluate(()=>({week:ST.activeWeek, pct:calcWeekPct(plan[0]), txt:document.body.innerText}));
    assert.strictEqual(st.week,0); assert.strictEqual(st.pct,0,'semana 1 nueva sin completar');
    assert.ok(st.txt.includes('Arrancamos bloque nuevo'),'mensaje nuevo visible');
    db=await page.evaluate(()=>window.__fakeDb);
    const prsAfter=val(db,'fs_prs_u1_v2');
    assert.strictEqual(prsAfter['Banco Plano'].rm4.weight,100,'PR de banco conservado');
    assert.ok(prsAfter['Banco Plano'].rm4.history.every(h=>h.block===OLD));
    assert.strictEqual(prsAfter['Banco Plano'].rm4.newPr,false);
    // "Ver resumen del bloque" desde el archivo: mismos datos del bloque viejo
    // Tocar de verdad el botón "Ver resumen del bloque" en la pantalla del bloque archivado
    await page.evaluate(b=>openArchivedBlock(b),bid);
    await page.getByText('Ver resumen del bloque').click();
    await page.waitForSelector('.summary-sheet');
    const sumU=await page.evaluate(()=>{ const r=calcBlockSummary(blockSummaryState.blockPlan,blockSummaryState.blockProgress); return {open:blockSummaryState.open,name:blockSummaryState.blockName,prog:blockSummaryState.blockProgress,prs:r.prs.map(p=>p.name),weeks:r.totalWeeks}; });
    assert.strictEqual(sumU.open,true); assert.strictEqual(sumU.name,OLD);
    assert.deepStrictEqual(sumU.prog,val(seed,'fs_prog_u1_v1'),'resumen usa el snapshot del bloque');
    assert.ok(sumU.prs.includes('Banco Plano'),'PRs del bloque en el resumen');
    // Un nombre con comilla no rompe el botón
    await page.evaluate(()=>{ closeBlockSummary(); archivedBlockView.block={...archivedBlockView.block,name:"Bloque d'Ana"}; render(); });
    await page.getByText('Ver resumen del bloque').click();
    await page.waitForSelector('.summary-sheet');
    assert.strictEqual(await page.evaluate(()=>blockSummaryState.blockName),"Bloque d'Ana");
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E publicar borrador: OK');

    // 3b) Entrar desde la pantalla de login (sin sesión guardada) NO borra el historial del bloque anterior
    ({page,errors}=await openApp(browser,db,null));
    await page.evaluate(async()=>{ authState.email='ana@x.com'; authState.pw='1234'; await doLogin(); });
    await page.waitForFunction(()=>session&&session.uid==='u1'); await page.waitForTimeout(400);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.deepStrictEqual(val(db,'fs_prs_u1_v2')['Banco Plano'].rm4.history.map(h=>[h.weight,h.block]),[[100,OLD]],'login conserva PRs del bloque anterior');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 3c) Con el historial global ya vacío (el daño real), el resumen igual muestra los PRs del bloque
    db.fs_prs_u1_v2=doc({});
    ({page,errors}=await openApp(browser,db,'u1'));
    await page.evaluate(b=>openArchivedBlock(b),bid);
    await page.getByText('Ver resumen del bloque').click();
    await page.waitForSelector('.summary-sheet');
    const sumW=await page.evaluate(()=>calcBlockSummary(blockSummaryState.blockPlan,blockSummaryState.blockProgress).prs.map(p=>[p.name,p.weight,p.week]));
    assert.deepStrictEqual(sumW.find(p=>p[0]==='Banco Plano'),['Banco Plano',100,1],'resumen calculado desde el bloque');
    db=await page.evaluate(()=>window.__fakeDb); assert.deepStrictEqual(errors,[]); await page.close();

    // 3d) Admin: reconstruir PRs del bloque archivado (simula, confirma, no duplica)
    ({page,errors}=await openApp(browser,db,'coach'));
    const dialogs=[]; page.on('dialog',d=>dialogs.push(d.message()));
    await page.evaluate(b=>rebuildBlockPrs(b),bid);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.ok(dialogs.some(m=>m.startsWith('Simulación')&&m.includes('Ana Test')),'muestra la simulación por alumno');
    const rebuilt=val(db,'fs_prs_u1_v2');
    assert.deepStrictEqual(rebuilt['Banco Plano'].rm4.history,[{weight:100,week:1,block:OLD}],'historial reconstruido');
    assert.strictEqual(rebuilt['Banco Plano'].rm4.weight,100);
    dialogs.length=0;
    await page.evaluate(b=>rebuildBlockPrs(b),bid);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.ok(dialogs[0].includes('no falta ninguna entrada'),'segunda pasada: nada que agregar');
    assert.deepStrictEqual(val(db,'fs_prs_u1_v2'),rebuilt,'sin duplicados');
    // Viendo como la alumna: cargar un peso no pisa los PRs del admin
    const coachPrs=JSON.stringify(val(db,'fs_prs_coach_v2'));
    await page.evaluate(async()=>{ await impersonateUser('u1'); const ex=plan[0].days[0].blocks[0].exercises[0]; setSetData(ex.id+'_s0','weight','90'); });
    await page.waitForTimeout(400);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(JSON.stringify(val(db,'fs_prs_coach_v2')),coachPrs,'PRs del admin intactos al ver como alumna');
    assert.deepStrictEqual(val(db,'fs_prs_u1_v2')['Banco Plano'].rm4.history.find(h=>h.block===OLD),{weight:100,week:1,block:OLD});
    await page.evaluate(()=>exitImpersonation());
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E PRs de bloque archivado: OK');

    // 4) Plantillas: guardar el bloque activo, cargarla al borrador, renombrar, duplicar, eliminar
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ openAdmin(); });
    await page.evaluate(()=>setAdminTab(10));
    await page.waitForFunction(()=>fsTplIndex!==null);
    await page.evaluate(()=>{ window.prompt=()=> 'Plantilla fuerza 9 semanas'; });
    await page.evaluate(()=>fsTplSaveFromActive());
    db=await page.evaluate(()=>window.__fakeDb);
    let idx=val(db,'fs_templates_v1');
    assert.strictEqual(idx.length,1); assert.strictEqual(idx[0].weeks,9); assert.strictEqual(idx[0].name,'Plantilla fuerza 9 semanas');
    const tid=idx[0].id;
    const tdoc=val(db,'fs_tpl_'+tid);
    assert.ok(tdoc.text.startsWith('NOMBRE: '+NEW)); assert.deepStrictEqual(tdoc.messages,{1:'Arrancamos bloque nuevo'});
    if(process.env.SHOTS){ await page.waitForTimeout(200); await page.screenshot({path:path.join(process.env.SHOTS,'plantillas.png')}); }
    await page.evaluate(id=>fsTplLoadToDraft(id),tid);
    await page.waitForSelector('#draft-text');
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_draft_v1').text,tdoc.text,'plantilla cargada al borrador');
    assert.strictEqual(val(db,'fs_draft_v1').messages[1],'Arrancamos bloque nuevo','mensajes vienen con la plantilla');
    assert.strictEqual(val(db,'fs_block_name_v1'),NEW,'cargar plantilla no publica');
    assert.ok((await page.locator('#draft-issues').innerText()).includes('igual al del bloque activo'));
    await page.evaluate(()=>setAdminTab(10)); await page.waitForFunction(()=>fsTplIndex!==null);
    await page.evaluate(()=>{ window.prompt=()=> 'Renombrada'; });
    await page.evaluate(id=>fsTplRename(id),tid);
    await page.evaluate(id=>fsTplDuplicate(id),tid);
    db=await page.evaluate(()=>window.__fakeDb);
    idx=val(db,'fs_templates_v1');
    assert.deepStrictEqual(idx.map(t=>t.name).sort(),['Renombrada','Renombrada (copia)']);
    await page.evaluate(id=>fsTplOpen(id),tid);
    await page.waitForSelector('#tpl-text');
    if(process.env.SHOTS) await page.screenshot({path:path.join(process.env.SHOTS,'plantilla-editor.png')});
    await page.evaluate(()=>{ fsTplEditMsg(2,'Semana 2 de la plantilla'); });
    await page.evaluate(()=>fsTplEditSave());
    await page.evaluate(()=>fsTplClose());
    await page.evaluate(id=>fsTplDelete(id),idx.find(t=>t.name.includes('copia')).id);
    db=await page.evaluate(()=>window.__fakeDb);
    idx=val(db,'fs_templates_v1');
    assert.strictEqual(idx.length,1);
    assert.strictEqual(val(db,'fs_tpl_'+tid).messages[2],'Semana 2 de la plantilla');
    assert.strictEqual(val(db,'fs_tpl_'+tid).name,'Renombrada');
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E plantillas: OK');

    // 5) Editar el bloque activo como texto: cambios seguros sí, agregar ejercicios no
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ openAdmin(); });
    await page.evaluate(()=>setAdminTab(3));
    await page.evaluate(()=>fsSafeOpen());
    await page.waitForSelector('#safe-text');
    const orig=await page.inputValue('#safe-text');
    const bad=orig.replace('PARTE: TREN INFERIOR\n1) PESO MUERTO C/PAUSA','PARTE: TREN INFERIOR\n1) NUEVO\n3 x 5\n2) PESO MUERTO C/PAUSA');
    await page.fill('#safe-text',bad); await page.waitForTimeout(400);
    assert.ok((await page.locator('#safe-issues').innerText()).includes('no se pueden agregar'),'agregar ejercicio bloqueado');
    await page.evaluate(()=>fsSafeApply());
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_plan_v1')[0].days[0].blocks[1].exercises.length,3,'no se aplicó');
    const good=orig.replace('1) BANCO PLANO C/BARRA (PAUSA 2")\n4 x 6 @6','1) BANCO PLANO C/BARRA (PAUSA 3")\n5 x 5 @6.5');
    await page.fill('#safe-text',good); await page.waitForTimeout(400);
    if(process.env.SHOTS) await page.screenshot({path:path.join(process.env.SHOTS,'editar-texto.png')});
    const before=val(db,'fs_plan_v1');
    await page.evaluate(()=>fsSafeApply());
    db=await page.evaluate(()=>window.__fakeDb);
    const after=val(db,'fs_plan_v1');
    const e0=after[0].days[0].blocks[0].exercises[0];
    assert.strictEqual(e0.id,before[0].days[0].blocks[0].exercises[0].id,'ID conservado');
    assert.strictEqual(e0.name,'BANCO PLANO C/BARRA (PAUSA 3")'); assert.strictEqual(e0.sets.length,5); assert.strictEqual(e0.sets[0].rpe,'@6.5');
    assert.strictEqual(after[0].message,'Arrancamos bloque nuevo','mensaje conservado');
    assert.strictEqual(after[0].days[0].icon,'🏋️');
    assert.strictEqual(val(db,'fs_plan_backup_v1').reason,'editar como texto');
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E editar como texto: OK');

    // 6) Recorrido rápido: todas las pestañas del admin de Fuerza y del Hybrid Club sin errores
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>{ openAdmin(); });
    for(const t of [0,1,2,3,9,10,4,5,6,7,8]){
      await page.evaluate(i=>setAdminTab(i),t); await page.waitForTimeout(250);
      const o=await page.evaluate(()=>{ const m=document.querySelector('#modal-root .modal'); return m.scrollWidth-m.clientWidth; });
      assert.strictEqual(o,0,'scroll horizontal en la pestaña '+t);
      if(process.env.SHOTS && (t===0||t===3)) await page.screenshot({path:path.join(process.env.SHOTS,'tab'+t+'.png')});
    }
    assert.deepStrictEqual(errors,[]); await page.close();
    db.fs_users_v1=doc({...val(db,'fs_users_v1'),hc:{id:'hc',name:'Hybrid Coach',email:'hc@x.com',hash:ctx.h,status:'active',club:'hybrid',admin:true}});
    ({page,errors}=await openApp(browser,db,null));
    await page.evaluate(()=>{ localStorage.setItem('fs_session_v1',JSON.stringify({uid:'hc',email:'hc@x.com',name:'Hybrid Coach',club:'hybrid'})); });
    await page.reload(); await page.waitForFunction(()=>window.__fsCloudReady && plan); await page.waitForTimeout(600);
    await page.evaluate(()=>{ openAdmin(); });
    for(const t of ['dash','atletas','planes','plantillas','config']){ await page.evaluate(k=>setAdminTab(k),t); await page.waitForTimeout(250); }
    assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Borrador del próximo bloque'));
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E pestañas admin (Fuerza y Hybrid): OK');
  }catch(e){ console.error('E2E FALLA:',e.message); process.exitCode=1; }
  finally{ await browser.close(); server.close(); }
})();
