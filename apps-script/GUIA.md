# Club WOD: conectar la planificación de Google Docs (desde una tablet Android con Chrome)

1. En Google Drive creá una carpeta (por ejemplo "Planificación WOD") y poné ahí los Documentos de Google de cada mes ("11. Planificación WOD Noviembre 2026", "12. Planificación WOD Diciembre 2026"...). Tienen que ser **Documentos de Google**, no archivos .docx: si tenés un .docx, abrilo y elegí Archivo → Guardar como Documentos de Google.
2. Abrí la carpeta en Chrome. Copiá el ID de la carpeta: es lo que está después de `/folders/` en la dirección.
3. En Chrome entrá a script.google.com. En el menú de Chrome (⋮) activá **"Sitio de escritorio"** para que el editor se vea completo. Tocá **Nuevo proyecto**.
4. Borrá lo que aparece en el editor y pegá todo el contenido de `apps-script/Code.gs`.
5. Arriba de todo, reemplazá `PEGAR_ID_DE_CARPETA` por el ID del paso 2 y `PEGAR_CLAVE` por una clave que inventes (por ejemplo `wod-ramiro-2026`). Tocá el ícono de guardar.
6. En la lista de funciones de arriba elegí **probar** y tocá **Ejecutar**. Google va a pedir permisos: elegí tu cuenta → "Configuración avanzada" → "Ir al proyecto (no seguro)" → **Permitir**. En el registro de ejecución tiene que aparecer "Documentos encontrados: N".
7. Tocá **Implementar → Nueva implementación**. En el engranaje elegí **Aplicación web**. "Ejecutar como": **Yo**. "Quién tiene acceso": **Cualquier persona**. Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).
8. En la app, entrá al Club WOD como Admin → **Borrador** → engranaje **Conexión con Drive**. Pegá la URL y la clave del paso 5. Tocá **Probar conexión**: tiene que decir "Conectado: N documentos encontrados". Tocá **Guardar**.
9. Listo: tocá **Actualizar desde Drive**, revisá cada semana en la vista previa y publicala.

**Si cambiás el script** (por ejemplo, la carpeta o la clave): Implementar → Administrar implementaciones → lápiz → Versión: **Nueva versión** → Implementar. La URL se mantiene. Si cambiaste la clave, cambiala también en la app.
