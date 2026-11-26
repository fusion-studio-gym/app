/**
 * Club WOD — lectura de la planificación desde Google Drive.
 * La app (Admin → Borrador → "Actualizar desde Drive") llama a esta aplicación web y recibe
 * el contenido de los documentos de la carpeta (y sus subcarpetas), en orden: párrafos, listas y tablas.
 *
 * Lee Documentos de Google y también archivos Word (.docx): los .docx se convierten a un
 * Documento de Google temporal, se leen y se borran enseguida (no quedan copias en tu Drive).
 * Para eso hay que activar el servicio avanzado "Drive API" (ver la guía).
 *
 * QUÉ EDITAR: solo las 3 constantes de abajo.
 */

// ID de la carpeta principal de Drive (lo que sigue a /folders/ en la URL). Se leen también sus subcarpetas (2024, 2025, 2026...)
const FOLDER_ID = 'PEGAR_ID_DE_CARPETA';
// Clave secreta: inventá una y pegá la misma en la app (Conexión con Drive)
const TOKEN = 'PEGAR_CLAVE';
// Solo se leen los archivos modificados en los últimos N días
const DIAS_ATRAS = 60;

// Tipos de archivo que se leen
const TIPO_DOC = 'application/vnd.google-apps.document';
const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Lo leído se guarda 6 horas por archivo (si el archivo no cambió, no se vuelve a convertir)
const CACHE_SEGUNDOS = 6 * 60 * 60;

// La app llama acá: .../exec?token=CLAVE
function doGet(e) {
  const token = e && e.parameter ? e.parameter.token : '';
  if (token !== TOKEN) return responder({ ok: false, error: 'token' });
  try {
    return responder({ ok: true, generatedAt: new Date().toISOString(), docs: leerCarpeta() });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message || err) });
  }
}

// Devuelve JSON
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Busca en la carpeta principal y en todas sus subcarpetas
function buscarArchivos() {
  const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
  const encontrados = [];
  function recorrer(carpeta, ruta) {
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const f = archivos.next();
      const tipo = f.getMimeType();
      if (tipo !== TIPO_DOC && tipo !== TIPO_DOCX) continue; // otros tipos: se ignoran
      if (f.getLastUpdated() < desde) continue;               // archivo viejo: se saltea
      encontrados.push({ archivo: f, tipo: tipo === TIPO_DOC ? 'Doc' : 'docx', carpeta: ruta });
    }
    const sub = carpeta.getFolders();
    while (sub.hasNext()) {
      const s = sub.next();
      recorrer(s, ruta ? ruta + '/' + s.getName() : s.getName());
    }
  }
  recorrer(DriveApp.getFolderById(FOLDER_ID), '');
  return encontrados;
}

// Lee todos los archivos encontrados
function leerCarpeta() {
  const docs = buscarArchivos().map(function (x) {
    const f = x.archivo;
    return {
      id: f.getId(),
      name: f.getName(),
      updated: f.getLastUpdated().toISOString(),
      url: f.getUrl(),
      type: x.tipo,
      folder: x.carpeta,
      blocks: leerConCache(f, x.tipo)
    };
  });
  docs.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return docs;
}

// Usa lo guardado si el archivo no cambió (clave = id + fecha de modificación)
function leerConCache(f, tipo) {
  const clave = 'wod_' + f.getId() + '_' + f.getLastUpdated().getTime();
  const guardado = cacheLeer(clave);
  if (guardado) return guardado;
  const blocks = tipo === 'Doc' ? leerDocumento(f.getId()) : leerDocx(f);
  cacheGuardar(clave, blocks);
  return blocks;
}

// .docx: copia temporal como Documento de Google → se lee → se borra (siempre, aunque haya error)
function leerDocx(f) {
  let tempId = null;
  try {
    const copia = Drive.Files.copy({ name: '[temporal WOD] ' + f.getName(), mimeType: TIPO_DOC }, f.getId());
    tempId = copia.id;
    return leerDocumento(tempId);
  } finally {
    if (tempId) {
      try { Drive.Files.remove(tempId); } catch (e) { Logger.log('No se pudo borrar el temporal ' + tempId + ': ' + e); }
    }
  }
}

// Contenido del documento en orden: párrafos (p), ítems de lista (li) y tablas (table)
function leerDocumento(id) {
  const body = DocumentApp.openById(id).getBody();
  const blocks = [];
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    const tipo = el.getType();
    if (tipo === DocumentApp.ElementType.PARAGRAPH) {
      const p = el.asParagraph();
      const text = p.getText();
      if (!text.trim()) continue; // párrafo vacío: se omite
      blocks.push({ t: 'p', text: text, heading: String(p.getHeading()), bold: todoEnNegrita(p) });
    } else if (tipo === DocumentApp.ElementType.LIST_ITEM) {
      const li = el.asListItem();
      blocks.push({ t: 'li', text: li.getText(), level: li.getNestingLevel() });
    } else if (tipo === DocumentApp.ElementType.TABLE) {
      blocks.push({ t: 'table', rows: leerTabla(el.asTable()) });
    }
  }
  return blocks;
}

// Filas y celdas de una tabla. Cada celda va con sus saltos de línea como \n (puede tener listas adentro)
function leerTabla(tabla) {
  const filas = [];
  for (let r = 0; r < tabla.getNumRows(); r++) {
    const fila = tabla.getRow(r);
    const celdas = [];
    for (let c = 0; c < fila.getNumCells(); c++) {
      const celda = fila.getCell(c);
      const lineas = [];
      for (let k = 0; k < celda.getNumChildren(); k++) {
        const hijo = celda.getChild(k);
        const t = hijo.getType();
        if (t === DocumentApp.ElementType.PARAGRAPH) lineas.push(hijo.asParagraph().getText());
        else if (t === DocumentApp.ElementType.LIST_ITEM) lineas.push(hijo.asListItem().getText());
      }
      celdas.push(lineas.join('\n').replace(/\u000b/g, '\n').trim());
    }
    filas.push(celdas);
  }
  return filas;
}

// true solo si todo el texto del párrafo está en negrita
function todoEnNegrita(p) {
  const t = p.editAsText();
  const texto = t.getText();
  for (let i = 0; i < texto.length; i++) {
    if (texto[i].trim() && !t.isBold(i)) return false;
  }
  return texto.trim().length > 0;
}

// ---- Caché (cada valor guardado puede tener hasta 100 KB: si es más grande se parte en pedazos) ----
function cacheGuardar(clave, datos) {
  try {
    const texto = JSON.stringify(datos);
    const TAM = 90000;
    const partes = {};
    let n = 0;
    for (let i = 0; i < texto.length; i += TAM) { partes[clave + '_' + n] = texto.slice(i, i + TAM); n++; }
    partes[clave] = String(n);
    CacheService.getScriptCache().putAll(partes, CACHE_SEGUNDOS);
  } catch (e) { Logger.log('No se pudo guardar en caché: ' + e); }
}
function cacheLeer(clave) {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(clave));
    if (!n) return null;
    const claves = [];
    for (let i = 0; i < n; i++) claves.push(clave + '_' + i);
    const partes = cache.getAll(claves);
    let texto = '';
    for (let i = 0; i < n; i++) {
      if (partes[clave + '_' + i] == null) return null; // falta un pedazo: se vuelve a leer
      texto += partes[clave + '_' + i];
    }
    return JSON.parse(texto);
  } catch (e) { return null; }
}

// Ejecutá esta función desde el editor para dar los permisos y ver qué encuentra
function probar() {
  const encontrados = buscarArchivos();
  Logger.log('Archivos encontrados (últimos ' + DIAS_ATRAS + ' días): ' + encontrados.length);
  let total = 0;
  encontrados.forEach(function (x) {
    const blocks = leerConCache(x.archivo, x.tipo);
    total += blocks.length;
    Logger.log('• ' + x.archivo.getName() + ' | tipo: ' + x.tipo + ' | carpeta: ' + (x.carpeta || '(principal)') + ' | bloques: ' + blocks.length);
  });
  Logger.log('Bloques en total: ' + total);
}
