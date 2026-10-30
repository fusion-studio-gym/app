// Prueba de punta a punta de la Etapa 1 (rol Profesor), con un Firestore SIMULADO en memoria
// (nunca toca la base real). Requiere Playwright y Chromium.
// Correr con: node tests/roles.e2e.js   (SHOTS=carpeta para guardar capturas)
const fs=require('fs'), path=require('path'), http=require('http'), vm=require('vm'), assert=require('assert');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const ctx={}; vm.createContext(ctx);
vm.runInContext([grabFn('buildDefaultWeek'),grabFn('buildDefaultRoutine'),grabFn('hashStr'),'this.plan=JSON.stringify(buildDefaultRoutine());this.h=hashStr("1234");'].join('\n'),ctx);

const doc=v=>({value:JSON.stringify(v),updatedAt:1});
const seed={
  fs_users_v1:doc({
    u1:{id:'u1',name:'Ana Test',email:'ana@x.com',hash:ctx.h,status:'active',club:'fuerza'},
    u2:{id:'u2',name:'Beto Alumno',email:'beto@x.com',hash:ctx.h,status:'active',club:'fuerza'},
    coach:{id:'coach',name:'Coach',email:'coach@x.com',hash:ctx.h,status:'active',club:'fuerza',admin:true},
    h1:{id:'h1',name:'Hybrid Uno',email:'h@x.com',hash:ctx.h,status:'active',club:'hybrid'}
  }),
  fs_plan_v1:{value:ctx.plan,updatedAt:1},
  fs_block_name_v1:doc('Bloque 5 - 2026'),
  fs_prog_u1_v1:doc({w1d1bue1_s0:{weight:'100',notes:'',done:true}}),
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
    localStorage.setItem('fs_current_club_v1',JSON.stringify('fuerza'));
  },[db,sessionUid]);
  await page.goto('http://localhost:'+server.address().port+'/index.html');
  await page.waitForFunction(()=>window.__fsCloudReady && typeof plan!=='undefined' && plan);
  await page.waitForTimeout(500);
  return {page,errors};
}
const val=(db,k)=>db[k]&&db[k].value!=null?JSON.parse(db[k].value):null;
const shot=async(page,name)=>{ if(process.env.SHOTS) await page.screenshot({path:path.join(process.env.SHOTS,name+'.png')}); };
const noHScroll=async page=>{
  const o=await page.evaluate(()=>{ const m=document.querySelector('#modal-root .modal'); return [m?m.scrollWidth-m.clientWidth:0, document.documentElement.scrollWidth-document.documentElement.clientWidth]; });
  assert.deepStrictEqual(o,[0,0],'scroll horizontal');
};

(async()=>{
  await new Promise(r=>server.listen(0,r));
  const browser=await chromium.launch();
  let db=JSON.parse(JSON.stringify(seed));
  try{
    // 1) Alta con "Soy profesor": queda pendiente con roleRequest, el registro de alumnos no cambia
    let {page,errors}=await openApp(browser,db,null);
    await page.evaluate(()=>switchAuth('register'));
    await page.getByText('Soy profesor').click();
    assert.ok((await page.locator('.auth-card-title').innerText()).includes('PROFESOR'));
    await shot(page,'registro-profesor');
    await page.fill('#a-name','Caro Profe'); await page.fill('#a-reg-email','caro@x.com');
    await page.fill('#a-reg-pw','123456'); await page.fill('#a-reg-pw2','123456');
    await page.evaluate(()=>{ authState.name='Caro Profe'; authState.email='caro@x.com'; authState.pw='123456'; authState.pw2='123456'; });
    await page.evaluate(()=>doRegister());
    // Alumno normal (sin tocar "Soy profesor")
    await page.evaluate(async()=>{ switchAuth('register'); authState.name='Fede Nuevo'; authState.email='fede@x.com'; authState.pw='123456'; authState.pw2='123456'; await doRegister(); });
    db=await page.evaluate(()=>window.__fakeDb);
    let us=Object.values(val(db,'fs_users_v1'));
    const caro=us.find(u=>u.email==='caro@x.com'), fede=us.find(u=>u.email==='fede@x.com');
    assert.strictEqual(caro.status,'pending'); assert.strictEqual(caro.roleRequest,'teacher'); assert.ok(!caro.role);
    assert.strictEqual(fede.status,'pending'); assert.ok(!fede.roleRequest&&!fede.role,'alumno sin campos nuevos');
    // Login pendiente: misma pantalla de siempre
    await page.evaluate(async()=>{ authState.email='caro@x.com'; authState.pw='123456'; await doLogin(); });
    assert.ok((await page.evaluate(()=>document.body.innerText)).includes('CUENTA PENDIENTE'));
    assert.deepStrictEqual(errors,[]); await page.close();

    // 2) Admin: Profesores lista el pedido; Usuarios no lo muestra; dashboard con tarjeta
    ({page,errors}=await openApp(browser,db,'coach'));
    await page.evaluate(()=>openAdmin()); await page.waitForTimeout(300);
    let dash=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(/PROFESORES/i.test(dash)&&dash.includes('0 habilitados')&&dash.includes('1 pendiente'),'tarjeta Profesores');
    assert.ok(/Alumnos activos\s*3/i.test(dash),'alumnos activos: Ana, Beto, Coach (sin profesores)');
    await page.evaluate(()=>setAdminTab(1)); await page.evaluate(()=>setUserSubTab('pending'));
    let usersTxt=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(usersTxt.includes('Fede Nuevo')&&!usersTxt.includes('Caro Profe'),'el pedido de profesor no está en Solicitudes');
    await page.evaluate(()=>setAdminTab(11));
    let tTxt=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(tTxt.includes('Caro Profe')&&tTxt.includes('PIDE SER PROFESOR')&&tTxt.includes('PENDIENTE'));
    await shot(page,'admin-profesores-pendiente'); await noHScroll(page);
    // Habilitar
    await page.evaluate(id=>enableTeacher(id),caro.id);
    db=await page.evaluate(()=>window.__fakeDb);
    let c=val(db,'fs_users_v1')[caro.id];
    assert.strictEqual(c.status,'active'); assert.strictEqual(c.role,'teacher'); assert.ok(!('roleRequest' in c));
    tTxt=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(tTxt.includes('HABILITADO')&&!tTxt.includes('PIDE SER PROFESOR'));
    // Convertir un alumno activo existente (Beto) — con confirmación
    await page.locator('#modal-root select').selectOption('u2');
    await page.getByRole('button',{name:'Convertir en profesor'}).click();
    await page.waitForTimeout(200);
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_users_v1').u2.role,'teacher');
    await shot(page,'admin-profesores');
    // Usuarios/Grupo/Dashboard sin profesores
    await page.evaluate(()=>setAdminTab(1)); await page.evaluate(()=>setUserSubTab('active'));
    usersTxt=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(usersTxt.includes('Ana Test')&&!usersTxt.includes('Caro Profe')&&!usersTxt.includes('Beto Alumno'),'Usuarios sin profesores');
    assert.ok(!usersTxt.includes('Hybrid Uno'),'Hybrid no aparece en Fuerza');
    const inStudentLoops=await page.evaluate(async()=>{ userActivityMap={}; await loadUserActivityStatus(); return Object.keys(userActivityMap); });
    assert.ok(!inStudentLoops.includes(caro.id)&&!inStudentLoops.includes('u2'),'actividad/adherencia sin profesores');
    await page.evaluate(()=>setAdminTab(0));
    dash=await page.locator('#modal-root .adm-main').innerText();
    assert.ok(dash.includes('2 habilitados')&&/Alumnos activos\s*2/i.test(dash));
    // Bloquear / desbloquear / quitar rol
    await page.evaluate(id=>blockTeacher(id),caro.id);
    db=await page.evaluate(()=>window.__fakeDb); assert.strictEqual(val(db,'fs_users_v1')[caro.id].status,'blocked');
    await page.evaluate(id=>unblockTeacher(id),caro.id);
    db=await page.evaluate(()=>window.__fakeDb); assert.strictEqual(val(db,'fs_users_v1')[caro.id].status,'active');
    await page.evaluate(()=>removeTeacherRole('u2'));
    db=await page.evaluate(()=>window.__fakeDb); assert.strictEqual(val(db,'fs_users_v1').u2.role,'user');
    assert.deepStrictEqual(errors,[]); await page.close();

    // 3) Profesor bloqueado no entra
    db.fs_users_v1=doc({...val(db,'fs_users_v1'),[caro.id]:{...val(db,'fs_users_v1')[caro.id],status:'blocked'}});
    ({page,errors}=await openApp(browser,db,null));
    let res=await page.evaluate(async()=>{ await loadUsers(); return loginUser('caro@x.com','123456','fuerza'); });
    assert.ok(!res.ok && /deshabilitada/.test(res.err),'bloqueado no entra');
    await page.close();
    db.fs_users_v1=doc({...val(db,'fs_users_v1'),[caro.id]:{...val(db,'fs_users_v1')[caro.id],status:'active'}});

    // 4) Profesor: pantalla propia, sin Home de alumno, PRs, progreso ni panel admin
    ({page,errors}=await openApp(browser,db,null));
    await page.evaluate(async()=>{ authState.email='caro@x.com'; authState.pw='123456'; await doLogin(); });
    await page.waitForTimeout(300);
    let txt=await page.evaluate(()=>document.body.innerText);
    assert.ok(txt.includes('PARTES DE')&&/Planificación/i.test(txt)&&/Plantillas/i.test(txt),'pantalla del profesor');
    assert.ok(!/TODAS LAS SEMANAS|RACHA|PRs|Progreso/i.test(txt),'no ve Home de alumno, PRs ni progreso');
    await shot(page,'profesor-home'); await noHScroll(page);
    await page.getByText('Plantillas',{exact:true}).last().click();
    assert.ok((await page.evaluate(()=>document.body.innerText)).includes('Próximamente'));
    await page.evaluate(()=>{ openAdmin(); openAdmin(); });
    assert.strictEqual(await page.evaluate(()=>document.getElementById('modal-root').innerHTML),'','sin panel admin ni modal de contraseña');
    assert.deepStrictEqual(await page.evaluate(()=>({r:userRole(),staff:isStaff(),mov:canEditPart('mov'),main:canEditPart('main')})),{r:'teacher',staff:true,mov:true,main:false});
    db=await page.evaluate(()=>window.__fakeDb);
    assert.strictEqual(val(db,'fs_prs_'+caro.id+'_v2'),null,'no se crean PRs para el profesor');
    // Al recargar con la sesión guardada sigue en su pantalla
    await page.reload(); await page.waitForFunction(()=>window.__fsCloudReady&&plan); await page.waitForTimeout(400);
    assert.ok((await page.evaluate(()=>document.body.innerText)).includes('PARTES DE'));
    assert.deepStrictEqual(errors,[]); await page.close();

    // 5) Alumno existente: igual que siempre
    ({page,errors}=await openApp(browser,db,'u1'));
    txt=await page.evaluate(()=>document.body.innerText);
    assert.ok(txt.includes('TODAS LAS SEMANAS')&&!txt.includes('PARTES DE'),'home del alumno');
    assert.deepStrictEqual(await page.evaluate(()=>({r:userRole(),staff:isStaff(),mov:canEditPart('mov')})),{r:'user',staff:false,mov:false});
    assert.deepStrictEqual(val(db,'fs_prog_u1_v1'),val(seed,'fs_prog_u1_v1'),'progreso intacto');
    assert.deepStrictEqual(errors,[]); await page.close();
    console.log('E2E roles (Etapa 1): OK');
  }catch(e){ console.error('FALLA E2E roles:',e.message); process.exitCode=1; }
  finally{ await browser.close(); server.close(); }
})();
