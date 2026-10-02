# ADR-0014: Distribución de la app Android de demostración

- **Estado:** Aceptado
- **Fecha:** 2026-10-02
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-64

## Contexto

El Hito 3 entrega el visor como aplicación Android, generada con Capacitor desde el mismo código ([ADR-0002](0002-visor-multiplataforma.md)). Es una demostración: la instalarán el equipo y algunas personas a las que se enseñe el producto, no una planta en producción.

Hay que decidir dos cosas que, una vez publicadas, cuesta cambiar:

1. **Cómo llega el APK** a quien lo prueba y cómo se entera de que hay una versión nueva.
2. **Cómo se firma.** Android solo instala una actualización si está firmada con la misma clave que la versión instalada. Perder la clave obliga a desinstalar la app y empezar de nuevo. Si se filtra, otra persona podría publicar una actualización falsa.

Partimos de esta situación:

- El repositorio es público y cada versión `vX.Y.Z` ya tiene su release en GitHub, con sus notas (LF-41).
- La CI compila en GitHub Actions; ningún portátil del equipo tiene JDK ni Android SDK (prueba de concepto de LF-12).
- El visor exige iniciar sesión: instalar la app no da acceso a ningún dato.
- La cuenta de Google Play tiene un coste único de 25 USD, y Firebase necesita un proyecto de Google. Las dos son decisiones del titular de la cuenta.

## Opciones consideradas

1. **APK firmado, adjunto a cada release de GitHub.** Se descarga desde la página de la versión y se instala permitiendo orígenes desconocidos.
2. **Firebase App Distribution.** Se invita a cada persona por correo. Firebase avisa de las versiones nuevas desde su app *App Tester*.
3. **Google Play, pista de prueba interna.** Hasta 100 personas, instalación y actualizaciones desde Play Store. Exige el formato AAB y la revisión de la ficha de la app.

## Decisión

1. **Cada versión `vX.Y.Z` publica el APK firmado como adjunto de su release de GitHub**, con su suma SHA-256 y la huella del certificado de firma en las notas. Lo compila y lo adjunta la CI al etiquetar (LF-67), no una persona.
2. **Las pull requests que tocan el visor compilan un APK de depuración** y lo guardan como artefacto de la ejecución durante 7 días. Se firma con la clave de depuración de cada compilación, así que no se puede instalar encima de la versión publicada.
3. **La clave de firma es un almacén PKCS12 con una sola clave RSA de 4096 bits, válida 30 años.** La crea el Tech Lead, no la CI, siguiendo `apps/dashboard/android/README.md` (LF-67). Se guarda en dos sitios:
   - **Secretos del entorno `android-release` de GitHub,** que solo pueden usar las etiquetas `v*`: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` y `ANDROID_KEY_ALIAS`.
   - **Copia en el gestor de contraseñas del titular,** con la contraseña. Es la única copia de seguridad.
4. **El identificador de la aplicación es `io.github.amariner.logicflows`**, que nunca cambia. Se basa en un dominio que controlamos (`amariner.github.io`). Para Android, otro identificador es otra aplicación.
5. **`versionName` es la versión de la etiqueta y `versionCode` se deriva de ella**: `mayor × 10 000 + menor × 100 + parche` (`v0.3.0` → `300`). Así cada versión publicada es mayor que la anterior, como exige Android.

## Justificación

- **Sin cuentas nuevas ni coste.** Es la única opción que no depende de una decisión externa del titular, y cabe en lo que ya tenemos: releases en GitHub y compilación en la CI.
- **Coherente con el resto de entregas.** Una versión es una etiqueta, y todo lo que se entrega cuelga de ella: imágenes promocionadas (ADR-0011), notas de la versión y, ahora, el APK.
- **Suficiente para una demo.** El público es pequeño y técnico. Instalar desde un origen desconocido es un paso que se explica una vez.
- **La seguridad la da la firma, no el canal.** Android rechaza una actualización con otra firma. La huella publicada permite comprobar el APK antes de la primera instalación.
- **No cierra la puerta a Google Play.** Play admite una clave de subida propia (*Play App Signing*) y el identificador no cambia. Si más adelante se publica en Play, la clave de este ADR puede ser la de subida.

## Alternativas descartadas

- **Firebase App Distribution.** Gestiona invitaciones y avisa de las actualizaciones, pero exige un proyecto de Google y añadir a cada persona por correo. Si ADR-0015 elige notificaciones push con Firebase Cloud Messaging, el proyecto existirá y esta opción se puede reconsiderar sin cambiar la firma.
- **Google Play, prueba interna.** Es lo más cómodo para quien instala, con actualizaciones automáticas, y la vía para llegar a una planta con gestión de dispositivos (*managed Google Play*). Exige el pago, la ficha y la revisión de Google, y migrar de APK a AAB. Hoy es un coste sin usuarios que lo aprovechen.
- **Que la CI genere la clave.** Sería automático, pero la clave quedaría solo en los secretos de GitHub, que no se pueden leer. Si el repositorio o el secreto se pierden, no hay copia: nunca más se podría actualizar la app instalada.

## Consecuencias

- **La app no se actualiza sola.** Quien la tenga instalada tiene que descargar la versión nueva desde la release. La propia app puede avisar más adelante comparando su versión con la última release, si hace falta.
- **Instalar exige permitir orígenes desconocidos** para el navegador o el gestor de archivos. Hay que explicarlo en las instrucciones de instalación.
- **El APK es público,** como el repositorio. No contiene secretos: la configuración de producción es pública y el acceso exige iniciar sesión.
- **La clave es un secreto crítico y de larga vida.** Perderla obliga a reinstalar en todos los dispositivos; filtrarla, a cambiarla y avisar a todos. El entorno `android-release` limita su uso a las etiquetas.
- **Hasta que exista la clave, LF-67 solo puede publicar APK de depuración.** Crearla es una tarea del Tech Lead al empezar el hito.

## Criterios de revisión

- La primera planta o cliente real: entonces se valorará la distribución mediante *managed Google Play* o el MDM de la planta.
- Más de unas 20 personas con la app instalada, o quejas por actualizar a mano.
- ADR-0015 crea un proyecto de Firebase, que haría casi gratis Firebase App Distribution.
- Se necesita iOS.
