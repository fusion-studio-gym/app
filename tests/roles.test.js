// Tests de roles (Admin / Profesor / Alumno): permisos de partes de clase y exclusión de profesores
// en los listados de alumnos. Correr con: node tests/roles.test.js
// Toma el bloque <roles> directamente de index.html para probar exactamente el código publicado.
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/const STATUS = \{[^\n]*\n[\s\S]*?\/\/ <roles>[\s\S]*?\/\/ <\/roles>/);
if(!m) throw new Error('No encontré el bloque <roles> en index.html');
const ctx={}; vm.createContext(ctx);
vm.runInContext(m[0]+'\nthis.out={STATUS,ROLE,STAFF_PARTS,roleOf,isTeacherListed,isStudentUser,canEditPartAs};',ctx);
const {STATUS,ROLE,STAFF_PARTS,roleOf,isTeacherListed,isStudentUser,canEditPartAs}=ctx.out;

let passed=0;
function test(name,fn){ try{ fn(); passed++; console.log('  ok  '+name); }catch(e){ console.error('FALLA '+name+'\n      '+e.message); process.exitCode=1; } }

const alumnoViejo={id:'a',name:'Ana',status:STATUS.ACTIVE,club:'fuerza'};            // sin campo role
const alumno={id:'b',name:'Beto',status:STATUS.ACTIVE,club:'fuerza',role:'user'};
const profe={id:'c',name:'Caro',status:STATUS.ACTIVE,club:'fuerza',role:'teacher'};
const profeBloq={...profe,id:'d',status:STATUS.BLOCKED};
const pide={id:'e',name:'Dani',status:STATUS.PENDING,club:'fuerza',roleRequest:'teacher'};
const pideBloq={...pide,id:'f',status:STATUS.BLOCKED};
const exProfe={id:'g',name:'Eli',status:STATUS.ACTIVE,club:'fuerza',role:'user'};       // le quitaron el rol
const pendienteAlumno={id:'h',name:'Fede',status:STATUS.PENDING,club:'fuerza'};

test('usuario sin campo role es alumno',()=>{
  assert.strictEqual(roleOf(alumnoViejo),'user');
  assert.strictEqual(roleOf(null),'user');
  assert.strictEqual(roleOf(profe),'teacher');
});

test('profesores y pedidos "Soy profesor" van a Profesores, no a alumnos',()=>{
  [profe,profeBloq,pide,pideBloq].forEach(u=>{ assert.ok(isTeacherListed(u),u.name); assert.ok(!isStudentUser(u),u.name); });
  [alumnoViejo,alumno,exProfe,pendienteAlumno].forEach(u=>{ assert.ok(!isTeacherListed(u),u.name); assert.ok(isStudentUser(u),u.name); });
});

test('los listados de alumnos excluyen profesores',()=>{
  const users=[alumnoViejo,alumno,profe,profeBloq,pide,pideBloq,exProfe,pendienteAlumno];
  const activos=users.filter(u=>u.status===STATUS.ACTIVE && isStudentUser(u)).map(u=>u.name);
  assert.deepStrictEqual(activos,['Ana','Beto','Eli']);
  const solicitudes=users.filter(u=>u.status===STATUS.PENDING && isStudentUser(u)).map(u=>u.name);
  assert.deepStrictEqual(solicitudes,['Fede'],'el pedido de profesor no aparece en Solicitudes de alumnos');
});

test('canEditPart: admin edita todo',()=>{
  [...STAFF_PARTS,'main','acc'].forEach(k=>assert.strictEqual(canEditPartAs('admin',k),true,k));
});
test('canEditPart: profesor solo Movilidad, Aproximaciones, Zona media y Cardio',()=>{
  assert.deepStrictEqual([...STAFF_PARTS],['mov','aprox','zmedia','cardio']);
  STAFF_PARTS.forEach(k=>assert.strictEqual(canEditPartAs(ROLE.TEACHER,k),true,k));
  ['main','acc','plan','',undefined].forEach(k=>assert.strictEqual(canEditPartAs(ROLE.TEACHER,k),false,String(k)));
});
test('canEditPart: alumno no edita nada',()=>{
  [...STAFF_PARTS,'main','acc'].forEach(k=>assert.strictEqual(canEditPartAs(ROLE.USER,k),false,k));
  assert.strictEqual(canEditPartAs(undefined,'mov'),false);
});

console.log(passed+' tests de roles OK'+(process.exitCode?' (con fallas)':''));
