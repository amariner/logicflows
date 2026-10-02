# ADR-0012: Previsualizaciones por pull request

- **Estado:** Aceptado
- **Fecha:** 2026-10-02
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-53

Sustituye a ADR-0008 en lo relativo a las previsualizaciones (puntos 2 y 3 de su decisión). El resto de ADR-0008 sigue vigente.

## Contexto

Quien revisa una pull request debe poder ver el cambio funcionando sin descargar la rama. Cada previsualización es un sistema completo y propio: visor, API, simulador, broker, Keycloak y PostgreSQL.

Ese sistema cuesta unos 0,50 USD al día mientras existe, y el límite de gasto de la cuenta detiene también producción. Muchas pull requests no tienen nada que ver en marcha: ADR, documentación o CI. Además, la CI ya ejecuta en cada PR la prueba de extremo a extremo contra el sistema completo en contenedores.

ADR-0008 preveía usar los entornos por pull request integrados de Railway, que copian un entorno base y compilan cada servicio desde el Dockerfile de la rama. Al preparar LF-53 aparecieron cuatro problemas:

- **Copiar producción no muestra el cambio.** Producción despliega imágenes ya publicadas (ADR-0011). Una copia ejecutaría la última versión de `main`, no el código de la rama.
- **Copiar producción arrastra su configuración.** Railway no copia las variables selladas, pero sí el resto, y con ellas la forma de producción. Para que la copia funcione hay que reconfigurarla igualmente.
- **Compilar en Railway duplica el trabajo.** La CI ya construye las cinco imágenes en cada pull request. Railway las volvería a compilar, más despacio, y lo previsualizado no sería el mismo artefacto que se probó.
- **La imagen de Keycloak de producción no tiene usuarios** (ADR-0010). Ni quien revisa ni la prueba de extremo a extremo podrían iniciar sesión.

Un spike del 2 de octubre comprobó contra Railway que la infraestructura como código (ADR-0011) puede describir otros entornos:

- `railway config apply` en un entorno vacío crea las instancias de los servicios del proyecto sin tocar producción. El plan de producción siguió sin diferencias.
- Los dominios con un nombre elegido (`logicflows-pr-N-visor.up.railway.app`) se crean desde el fichero y responden en segundos.
- El fichero recibe el nombre del entorno (`ctx.environmentName`).

## Opciones consideradas

**Cuándo se crea:**

1. **En todas las pull requests**, al abrirlas.
2. **Bajo demanda**, cuando alguien la pide en la PR.
3. **Híbrida:** automática si la PR cambia el despliegue (`.railway/`, `Dockerfile`, `infra/`) y bajo demanda en el resto.

**Origen del código:**

1. **Imágenes de la PR en GHCR** y un flujo propio que crea, actualiza y borra el entorno con la infraestructura como código.
2. **Entornos integrados de Railway** con un entorno base que compila desde el Dockerfile de la rama.
3. **Copiar producción tal cual**, con las imágenes publicadas.

**Usuarios de prueba:**

1. **Realm de pruebas con un usuario de solo lectura** cuya contraseña llega por una variable de entorno.
2. **El realm local con `operario`**, cuyas credenciales están publicadas en el repositorio.
3. **Alta por la API de administración** de Keycloak tras cada despliegue.

## Decisión

1. **Bajo demanda, con una etiqueta.** Una PR tiene previsualización solo si lleva la etiqueta `previsualizacion`. Ponerla crea el entorno, y cada commit posterior lo actualiza. Quitarla o cerrar la PR lo borra. Sin la etiqueta no se publican imágenes ni se usa Railway.
2. **Las previsualizaciones despliegan imágenes de la PR.** En cada commit de una pull request con la etiqueta se publican en GHCR las cinco imágenes con la etiqueta `pr-<número>-<commit>`. Las de producción siguen saliendo solo de `main` (`sha-…` y `vX.Y.Z`).
3. **El entorno se describe en `.railway/railway.ts`**, el mismo fichero que producción. El entorno se llama `pr-<número>`, y los dominios, `logicflows-pr-<número>-<servicio>.up.railway.app`. El fichero rechaza cualquier entorno que no sea `production` o `pr-<número>`.
4. **El entorno se crea vacío, no se copia.** No hereda nada de producción: ni datos, ni variables, ni secretos.
5. **Un flujo propio gestiona el ciclo de vida** (`Previsualización`):
   - al poner la etiqueta y con cada commit posterior, publica las imágenes, aplica el fichero y espera a que el despliegue nuevo esté sano;
   - publica las direcciones en la PR y ejecuta la prueba de extremo a extremo contra la previsualización;
   - al quitar la etiqueta o cerrar la PR, fusionada o no, borra el entorno y sus volúmenes.

   La lógica está en `infra/railway/previsualizacion.sh`, que también puede ejecutarse en local. Los entornos integrados de Railway siguen desactivados.
6. **Secretos derivados por entorno.** Cada secreto de una previsualización es un HMAC-SHA256 de `pr-<número>:<nombre>` con una semilla guardada como secreto de GitHub (`PREVIEW_SECRETS_SEED`):
   - son distintos en cada previsualización y estables entre commits, así que actualizar no exige rotar nada;
   - sin la semilla no se pueden calcular;
   - no se sellan, porque Railway solo permite sellar desde la web. Solo los ve quien tenga acceso al proyecto, y desaparecen con el entorno.
7. **Realm de pruebas.** La imagen de Keycloak de las previsualizaciones se construye con la etapa `identity-preview` del Dockerfile. Su realm es el de producción más un usuario `prueba-e2e`, que solo tiene el rol `viewer`. Su contraseña se toma al importar de `LOGICFLOWS_E2E_PASSWORD`, que recibe el valor del secreto `E2E_PASSWORD`. La imagen de producción (`identity`) sigue sin usuarios.
8. **PostgreSQL como en producción.** Cada previsualización ejecuta `infra/postgres/usuarios.sql` para crear los usuarios y bases de datos de la API y de Keycloak. Así se ejercita el mismo procedimiento que en producción.

## Justificación

- **Solo se paga lo que se usa.** Una previsualización se pide cuando hay algo que ver o que probar en Railway. Las PR de documentación o de CI no consumen nada, y un número alto de PR abiertas no se acerca al límite de gasto que también detiene producción.

- **Se previsualiza lo que se probó.** La CI y la previsualización usan la misma imagen, y producción despliega imágenes de la misma forma. Compilar en Railway produciría otro artefacto, más tarde.
- **Un solo fichero describe los dos entornos.** Una diferencia entre producción y una previsualización se ve en el código: dominios, origen de los secretos y realm. ADR-0011 pedía revisar la decisión si las previsualizaciones no cabían en el fichero, y caben.
- **Aislamiento por construcción.** Al no copiar producción, la previsualización solo tiene lo que el fichero le da.
- **Secretos sin estado.** Con secretos aleatorios habría que guardarlos entre commits o regenerarlos y rotarlos en cada despliegue. Derivarlos de una semilla da secretos estables sin guardar nada.

## Alternativas descartadas

- **En todas las pull requests:** es lo que hacen las plataformas en las que una previsualización es casi gratis. Aquí cada una es un sistema completo con base de datos y de pago, y muchas PR no tienen nada que ver en marcha.
- **Híbrida por rutas:** cubre automáticamente los cambios de despliegue, que son los que la CI en contenedores no detecta. Se descarta por sencillez: quien cambia el despliegue pone la etiqueta, y la regla de rutas sería otra pieza que mantener.

- **Entornos integrados de Railway:** no requieren código propio, y por eso los eligió ADR-0008. Se descartan porque compilan otra vez lo que ya construyó la CI, cada commit tarda más y el artefacto previsualizado no es el que se prueba ni el que se desplegará. Además, saber cuándo ha terminado el despliegue para lanzar la prueba exigiría escuchar los eventos de despliegue de GitHub.
- **Copiar producción:** no muestra el código de la rama. No cumple el objetivo.
- **Realm local con `operario`:** la contraseña está publicada en el repositorio, y cualquiera con la dirección de una previsualización podría entrar. Solo hay datos simulados, pero el coste lo paga la cuenta.
- **Alta por la API de administración:** obliga a gestionar un administrador por entorno y añade piezas que pueden fallar, sin ventaja para un entorno efímero.

## Consecuencias

**Positivas:**

- Cada pull request puede tener su sistema completo, con la prueba de extremo a extremo ejecutada contra él.
- Producción y previsualizaciones comparten fichero, imágenes y procedimiento de base de datos.
- Ninguna previsualización ve datos, variables ni secretos de producción.

**Costes y riesgos:**

- **Automatización propia.** Es lo que ADR-0008 quería evitar. Se acota con un único script y un flujo, y se apoya en la infraestructura como código que ya existía.
- **Un token de cuenta de Railway en GitHub** (`RAILWAY_API_TOKEN`). Un token de proyecto está limitado a un entorno y no puede crear otros. Este token también alcanza producción, así que el flujo:
  - solo se ejecuta en pull requests de ramas del propio repositorio, no de forks;
  - nunca usa `--confirm-destructive`.

  Lo crea y lo rota el titular de la cuenta.
- **Más imágenes en GHCR:** cinco por commit de cada PR con previsualización. Las etiquetas `pr-*` no se usan en producción y pueden limpiarse.
- **Hay que acordarse de pedirla.** Un cambio que rompa el despliegue en Railway puede llegar a `main` sin haberse probado allí si nadie pone la etiqueta. Lo mitigan la prueba de producción tras cada despliegue (LF-57) y la vuelta atrás.
- **Coste:** cada previsualización cuesta unos 0,50 USD al día (ADR-0008) mientras existe. Una PR con la etiqueta y olvidada sigue costando, y si se alcanza el límite de gasto de la cuenta, Railway detiene todo, producción incluida.
- **Secretos sin sellar en las previsualizaciones**, visibles para quien acceda al proyecto en Railway.
- **La semilla es un secreto más.** Si se filtra, permite calcular los secretos de cualquier previsualización, pero no los de producción. Se rota cambiándola; las previsualizaciones abiertas se recrean.

## Criterios de revisión

- El coste de las previsualizaciones se acerca al límite de gasto de la cuenta.
- Railway permite crear previsualizaciones integradas a partir de imágenes ya construidas.
- El flujo propio exige un mantenimiento frecuente.
- Colaboradores externos abren pull requests desde forks y necesitan previsualización.
