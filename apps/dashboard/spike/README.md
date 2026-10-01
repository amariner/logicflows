# Spike LF-56: renderizado en el servidor (SSR)

Rama de prueba de concepto; **no se fusiona**. Resultados y recomendación en la tarea LF-56 de Jira.

Cambios para que el visor se renderice en el servidor:

- `ng add @angular/ssr`, con un servidor Express (`src/server.ts`) y compresión.
- Configuración de la aplicación separada en `app.config.ts`.
- En el servidor: `config.json` se sustituye por `API_URL`, no se comprueba la sesión y no se abre el canal de tiempo real.

Medición (`spike/medir-carga.mjs`): usuario que vuelve con sesión, sin service worker ni caché, en «Fast 3G» (562 ms de latencia, 1,6 Mbit/s) y CPU ralentizada ×4. Mediana de 3 cargas.

| Variante | Primer contenido | Datos en pantalla | Transferido |
|---|---|---|---|
| Estática con Nginx, sin compresión (actual) | 7,2 s | 8,0 s | 883 KB |
| Estática con Nginx y gzip | 3,7 s | 4,45 s | 235 KB |
| SSR, sin compresión | 1,7 s | 7,5 s | 891 KB |
| SSR con compresión | 1,3 s | 4,45 s | 242 KB |

```sh
NG_ALLOWED_HOSTS=localhost PORT=8100 API_URL=http://localhost:3000 node www/server/server.mjs
node spike/medir-carga.mjs 3
```
