# Club WOD: conectar la planificación de Google Docs (desde una tablet Android con Chrome)

1. En Google Drive usá una carpeta principal (por ejemplo "Planificación WOD"). Adentro pueden ir subcarpetas por año (2024, 2025, 2026...). Sirven tanto los Documentos de Google como los archivos Word (.docx): los .docx se leen convirtiéndolos a un documento temporal que el script borra enseguida.
2. Abrí la carpeta en Chrome. Copiá el ID de la carpeta: es lo que está después de `/folders/` en la dirección.
3. En Chrome entrá a script.google.com. En el menú de Chrome (⋮) activá **"Sitio de escritorio"** para que el editor se vea completo. Tocá **Nuevo proyecto**.
4. Borrá lo que aparece en el editor y pegá todo el contenido de `apps-script/Code.gs`.
5. Arriba de todo, reemplazá `PEGAR_ID_DE_CARPETA` por el ID del paso 2 y `PEGAR_CLAVE` por una clave que inventes (por ejemplo `wod-ramiro-2026`). Tocá el ícono de guardar.
6. Activá el servicio avanzado **Drive API** (hace falta para leer los .docx): en la barra de la izquierda, al lado de **Servicios**, tocá el **+**. En la lista elegí **Drive API**, dejá la versión **v3** y el identificador **Drive**, y tocá **Añadir**. Tiene que aparecer "Drive" debajo de Servicios.
7. En la lista de funciones de arriba elegí **probar** y tocá **Ejecutar**. Google va a pedir permisos: elegí tu cuenta → "Configuración avanzada" → "Ir al proyecto (no seguro)" → **Permitir**. En el registro de ejecución aparece cada archivo con su tipo (Doc o docx), su carpeta y cuántos bloques leyó.
8. Tocá **Implementar → Nueva implementación**. En el engranaje elegí **Aplicación web**. "Ejecutar como": **Yo**. "Quién tiene acceso": **Cualquier persona**. Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).
9. En la app, entrá al Club WOD como Admin → **Borrador** → engranaje **Conexión con Drive**. Pegá la URL y la clave del paso 5. Tocá **Probar conexión**: tiene que decir "Conectado: N documentos encontrados". Tocá **Guardar**.
10. Listo: tocá **Actualizar desde Drive**, revisá cada semana en la vista previa y publicala.

**Cada vez que cambies el script** (por ejemplo, al pegar una versión nueva, o al cambiar la carpeta o la clave): Implementar → Gestionar implementaciones → lápiz (editar) → Versión: **Nueva versión** → Implementar. Así la URL sigue siendo la misma y no hay que cambiarla en la app. Si cambiaste la clave, cambiala también en la app.
