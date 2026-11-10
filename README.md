# Compañero del bosque

Filtro facial web instalable para Android y iPhone. Detecta una cara en tiempo real y coloca una máscara ilustrada inspirada en la imagen de referencia.

## Probar en el ordenador

Desde esta carpeta inicia un servidor local:

```powershell
python -m http.server 8000
```

Abre `http://localhost:8000` en un navegador compatible y pulsa **Probar con mi cámara**. Para abrirlo desde un teléfono o instalarlo como aplicación, publícalo en un sitio con HTTPS. En iPhone, abre el sitio publicado en Safari y usa **Compartir → Añadir a pantalla de inicio**; en Android, usa la opción **Instalar aplicación** del navegador.

Se necesita conexión a internet para cargar MediaPipe y su modelo facial. Los fotogramas de la cámara se analizan en el dispositivo y no se guardan ni se envían.
