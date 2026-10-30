// Arnés compartido de las pruebas de punta a punta: sirve index.html con un Firestore SIMULADO
// en memoria (nunca toca la base real). Requiere Playwright y Chromium.
const fs=require('fs'), path=require('path'), http=require('http'), vm=require('vm'), assert=require('assert');
const root=path.join(__dirname,'..','..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function grabFn(name){ const s=html.indexOf('function '+name+'('); let i=html.indexOf('{',s),d=0; for(;i<html.length;i++){ if(html[i]==='{')d++; else if(html[i]==='}'){ d--; if(!d) break; } } return html.slice(s,i+1); }
const ctx={}; vm.createContext(ctx);
vm.runInContext([grabFn('buildDefaultWeek'),grabFn('buildDefaultRoutine'),grabFn('hashStr'),'this.plan=JSON.stringify(buildDefaultRoutine());this.h=hashStr("1234");'].join('\n'),ctx);
const PLAN_JSON=ctx.plan, HASH_1234=ctx.h;
const doc=v=>({value:JSON.stringify(v),updatedAt:1});
const val=(db,k)=>db[k]&&db[k].value!=null?JSON.parse(db[k].value):null;
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
function listen(){ return new Promise(r=>server.listen(0,r)); }
function close(){ server.close(); }
// db: objeto compartido. Si `shared` es true, todas las páginas abiertas usan la MISMA base (para probar
// ediciones simultáneas); si no, cada página arranca con una copia de `db`.
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
const shot=async(page,name)=>{ if(process.env.SHOTS) await page.screenshot({path:path.join(process.env.SHOTS,name+'.png')}); };
const noHScroll=async page=>{
  const o=await page.evaluate(()=>{ const m=document.querySelector('#modal-root .modal'); return [m?m.scrollWidth-m.clientWidth:0, document.documentElement.scrollWidth-document.documentElement.clientWidth]; });
  assert.deepStrictEqual(o,[0,0],'scroll horizontal');
};
module.exports={root,html,PLAN_JSON,HASH_1234,doc,val,openApp,listen,close,shot,noHScroll};
