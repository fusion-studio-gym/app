/**
 * Club WOD — lectura de la planificación desde Google Docs.
 * La app (Admin → Borrador → "Actualizar desde Drive") llama a esta aplicación web y recibe
 * el contenido de los Documentos de Google de la carpeta, en orden (párrafos, listas y tablas).
 *
 * QUÉ EDITAR: solo las 3 constantes de abajo.
 */

// ID de la carpeta de Drive donde están los documentos del mes (lo que sigue a /folders/ en la URL)
const FOLDER_ID = 'PEGAR_ID_DE_CARPETA';
// Clave secreta: inventá una y pegá la misma en la app (Conexión con Drive)
const TOKEN = 'PEGAR_CLAVE';
// Solo se leen los documentos modificados en los últimos N días
const DIAS_ATRAS = 60;

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

// Recorre los Documentos de Google de la carpeta modificados en los últimos DIAS_ATRAS días
function leerCarpeta() {
  const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
  const archivos = DriveApp.getFolderById(FOLDER_ID).getFilesByType(MimeType.GOOGLE_DOCS);
  const docs = [];
  while (archivos.hasNext()) {
    const f = archivos.next();
    if (f.getLastUpdated() < desde) continue; // documento viejo: se saltea
    docs.push({
      id: f.getId(),
      name: f.getName(),
      updated: f.getLastUpdated().toISOString(),
      url: f.getUrl(),
      blocks: leerDocumento(f.getId())
    });
  }
  docs.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return docs;
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

// Ejecutá esta función una vez desde el editor para dar los permisos y ver que lea bien la carpeta
function probar() {
  const docs = leerCarpeta();
  let bloques = 0;
  docs.forEach(function (d) { bloques += d.blocks.length; Logger.log(d.name + ': ' + d.blocks.length + ' bloques'); });
  Logger.log('Documentos encontrados: ' + docs.length + ' · bloques en total: ' + bloques);
}
