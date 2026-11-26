# CLAUDE.md — App Fusion Studio / Fusión Hybrid Club

Instrucciones fijas para Claude Code. Leer antes de cada tarea.

## Quién trabaja en este repo

- Dueño: Ramiro Alvarez Rellihan (coach, dueño de Fusion Studio y co-fundador de Fusión Hybrid Club).
- Ramiro **no tiene computadora**: trabaja solo desde celular y tablet. No proponer pasos que requieran terminal, instalar programas o editar archivos a mano.
- Hablar siempre en español rioplatense, claro y directo, sin jerga técnica innecesaria. Si hay que usar un término técnico, explicarlo en una línea.

## Qué es esta app

Una sola web app con **tres ramas** (clubes), elegidas con un selector en la pantalla de login. Cada rama tiene su propio acceso de Admin.

### Stack
- App en un único archivo HTML (`index.html`), con su CSS y JS adentro. Mantener ese formato salvo que Ramiro pida lo contrario.
- Datos en **Firebase Firestore**.
- Publicación en **GitHub Pages** desde la rama principal. Lo que se mergea a la rama principal queda publicado.
- Antes de la primera tarea de cada sesión, revisar la estructura real del repo y avisar si algo de este archivo no coincide.

### Rama 1 — Fusion Studio (fuerza / sobrecarga progresiva)
Funciones existentes:
- Registro de pesos por serie, series completadas, notas de sesión y popups de RPE.
- PRs por **nombre de ejercicio** (no por ID de plan) y gráficos de progreso por ejercicio.
- Vista de progreso del alumno.
- Admin (se abre con toque largo sobre el logo): duplicar semana, gestión de usuarios con sub-pestañas Activos/Pendientes y sistema de aprobación.
- Barra de navegación inferior por pestañas.

Reglas de negocio:
- Tres ejercicios base permanentes: **Banco Plano, Back Squat, Peso Muerto**.
- Cumplimiento semanal: Día 1 y Día 2 valen 50% cada uno. En cada uno alcanza con completar Tren Superior **o** Tren Inferior para que cuente.
- El Día 3 (viernes/sábado) es opcional y **no** cuenta en el porcentaje semanal.
- Bloque de fuerza de 9 semanas: S1–S2 4x6@6 (con variantes), S3–S4 3x4@7, S5–S6 4x4@7, S7–S8 3x4@8, S9 3x6@5 (descarga).

Pendientes conocidos:
- PRs y gráficos que no aparecían en Semanas 1–2: la función `matchTracked` rechazaba nombres de ejercicios con la abreviatura `C/`. Verificar si el arreglo ya está aplicado; si no, aplicarlo.
- Función de **mensaje semanal** dentro de la app: versión corta y resumida del mensaje de WhatsApp que ven los alumnos.

### Rama 2 — Fusión Hybrid Club (planificación a distancia para HYROX y carreras híbridas)
Funciones previstas:
- Planificación día/semana/mes editable por alumno y Admin.
- Ficha de alumno ampliada: foto, datos antropométricos, testeos de fuerza, VO2 Max.
- Chat directo profesor-alumno.
- Calendario de carreras híbridas (HYROX, Hybrid Race, Smart Race) con cuenta regresiva.
- Reserva de videollamadas de revisión de bloque.
- Dashboard de Admin ampliado.

Estado:
- Hechos: TRAC y notificaciones.
- Pendiente: vista de escritorio del Admin, detectada automáticamente por el ancho de pantalla, **sin login aparte**.

Marca Hybrid Club:
- Paleta oficial: amarillo `#FFEC03`, negro `#000000`, blanco `#FFFFFF`. No usar la paleta vieja negro/naranja.
- Tipografía de marca: "UAV OSD Sans Mono".
- La fuente de títulos **no soporta acentos**: escribir los textos visibles de títulos sin tilde (ej. "Recuperacion").
- Sobre fondo amarillo, íconos y tildes van en **negro**, nunca en blanco.
- Logo: "F" negro/amarillo con wordmark en bloque "HYBRID CLUB".

### Rama 3 — Club WOD (clases de WOD)
- Toma la base del Admin de Fuerza y una versión reducida de la experiencia de alumno de Hybrid Club. Todo el código vive en el bloque "CLUB WOD" de `index.html` y en `// <wod-core>` (funciones puras, con tests en `tests/wod-parser.test.js` y `tests/wod.e2e.js`).
- Misma cuenta para los tres clubes: la pertenencia al WOD va en `clubs.wod` del usuario (`status`, `role`) y el sexo en `sex`. No hay ficha ni nivel guardado.
- Unidad de planificación: la semana (lunes a domingo). El borrador se pega tal cual desde Word y cada semana se publica por separado. El Warm Up lo ven solo Admin y Profesores.
- Marca: negro `#000000`, azul `#2B35E0` (logo de `#1A1F9E` a `#2B35E0`), azul claro `#7C86FF`, blanco. Títulos en Orbitron (soporta tildes y ñ). Logo en `assets/logo-wod.png`.
- Registro del alumno: categoría (obligatoria), resultado en texto libre (`resultText`), kilos y notas. Los registros viejos muestran su resultado armado con los campos anteriores.
- El WOD se ve desde el día anterior (sin poder registrarlo). La presentación (tarjetas, chips de peso, "Ver pesos de") se arma en `wodPresent` / `wodApplyWeights` sin cambiar el texto guardado.
- Colores de nivel: Principiante `#555555`, Intermedio `#7C86FF`, Avanzado `#2B35E0`, Rx `#FFFFFF` (texto negro).

La landing de Fusión Hybrid Club (fusionhybridclub.online) es un deploy aparte: **no** se toca desde este repo.

## Cómo trabajar

1. **Una tarea = un cambio.** No mezclar cambios de las dos ramas en la misma tarea salvo que se pida.
2. **No romper la rama que no se está tocando.** Si un cambio afecta código compartido (login, selector de club, Firebase), avisarlo antes.
3. **Datos de Firebase intocables.** Nunca borrar, renombrar ni cambiar la estructura de colecciones o campos existentes sin preguntar primero. Si hace falta un campo nuevo, agregarlo de forma compatible con los datos actuales.
4. **Cambios de diseño grandes: primero la propuesta.** Describir cómo se va a ver (o armar una versión de prueba) y esperar el OK antes de implementarlo.
5. **Pensado para celular primero.** Todo tiene que funcionar bien a ancho de teléfono. La vista de escritorio es un agregado.
6. **Probar antes de terminar.** Revisar que el HTML no tenga errores, que no se haya roto el login ni la navegación, y contar en pocas líneas qué se probó.
7. **Resumen final simple.** Al terminar: qué cambió, cómo verlo en la app y si hay algo que Ramiro tenga que revisar a mano.
8. Si un pedido es ambiguo o choca con las reglas de este archivo, preguntar antes de avanzar.
