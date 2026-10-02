# App Android

Proyecto Android del visor, generado con Capacitor a partir de la build de producción (ADR-0002). Cómo se prepara y se prueba está en el [README del visor](../README.md#app-android); cómo se distribuye, en [ADR-0014](../../../docs/adr/0014-distribucion-de-la-app-android.md).

## Versiones publicadas

Cada etiqueta `vX.Y.Z` lanza el flujo **App Android** (`.github/workflows/android-release.yml`):

1. Compila el APK de release de la etiqueta, con `versionName` X.Y.Z y `versionCode` X × 10 000 + Y × 100 + Z.
2. Lo firma con la clave del entorno `android-release` y comprueba la firma con `apksigner`.
3. Lo adjunta como `logicflows-vX.Y.Z.apk` a la release de la etiqueta, con su SHA-256 y la huella del certificado. Si la release no existe, la crea con la sección de la versión de `CHANGELOG.md`.

Sin la clave, el flujo falla y no publica nada. Para volver a publicar una versión a partir de `v0.3.0`: `gh workflow run android-release.yml --ref vX.Y.Z`.

Cada pull request comprueba además la firma de release con una clave desechable creada por `crear-clave.sh`. Así, un cambio que rompa la firma falla en la PR y no al publicar.

## Crear la clave de firma (una vez, el Tech Lead)

La clave identifica la app para siempre: Android solo instala una actualización firmada con la misma clave. Perderla obliga a desinstalar la app en todos los dispositivos. Por eso la crea su titular, no la CI, y guarda la única copia de seguridad.

Hace falta OpenSSL 3: en macOS, el de Homebrew (`/opt/homebrew/bin/openssl`). No hace falta JDK.

1. Generar una contraseña y guardarla en el gestor de contraseñas, en una entrada nueva «LogicFlows · clave de firma Android»:

   ```sh
   openssl rand -base64 32
   ```

2. Crear la clave en una carpeta fuera del repositorio. La contraseña se pide sin mostrarla:

   ```sh
   read -rs ANDROID_KEYSTORE_PASSWORD && export ANDROID_KEYSTORE_PASSWORD
   apps/dashboard/android/crear-clave.sh ~/logicflows-android.p12
   ```

   El script muestra la huella SHA-256 del certificado. Hay que anotarla en la misma entrada del gestor: es la que se publicará con cada APK.

3. Adjuntar `~/logicflows-android.p12` a esa entrada del gestor de contraseñas. Es la copia de seguridad.

4. Guardar los tres secretos en el entorno `android-release` de GitHub, que solo pueden usar las etiquetas `v*`:

   ```sh
   base64 -i ~/logicflows-android.p12 | gh secret set ANDROID_KEYSTORE_BASE64 --env android-release --repo amariner/logicflows
   printf '%s' "$ANDROID_KEYSTORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD --env android-release --repo amariner/logicflows
   printf 'logicflows' | gh secret set ANDROID_KEY_ALIAS --env android-release --repo amariner/logicflows
   ```

5. Borrar la copia local y la variable:

   ```sh
   rm ~/logicflows-android.p12
   unset ANDROID_KEYSTORE_PASSWORD
   ```

6. La primera versión que incluye este flujo es `v0.3.0`: al etiquetarla, el APK firmado aparecerá en su release. Las etiquetas anteriores no lo contienen, así que no se puede relanzar sobre ellas.

## Si la clave se filtra

Quien la tenga puede publicar una actualización que Android aceptaría. Hay que:

1. Retirar los APK publicados de las releases.
2. Crear una clave nueva con este procedimiento y sustituir los secretos.
3. Avisar a quien tenga la app instalada: tiene que desinstalarla e instalar la versión nueva, porque Android no actualiza entre firmas distintas.
