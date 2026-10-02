# Demo del Hito 2

Guion para enseñar LogicFlows `v0.2.0` en unos 20 minutos: el sistema funcionando en Internet, cómo llega un cambio desde una pull request hasta producción y cómo se vigila. Complementa la [demo del Hito 1](demo.md), que recorre el comportamiento de la célula en local.

## Preparación

- Una cuenta con rol `viewer` en el realm `logicflows` de producción ([alta de usuarios](../infra/keycloak/README.md#alta-y-primer-acceso-en-producción-lf-48)).
- Una pull request abierta con algún cambio visible, por ejemplo un texto del visor, y acceso de escritura al repositorio para ponerle etiquetas.
- El navegador de escritorio y, si es posible, un móvil con la PWA instalada.

Las direcciones de producción están en [Despliegue](despliegue.md).

## Recorrido

| Paso | Qué hacer | Qué se ve | Qué demuestra |
|---|---|---|---|
| 1 | Abrir el visor de producción | Redirección al inicio de sesión de LogicFlows en Keycloak, con HTTPS | El sistema está en Internet y nada se ve sin identificarse (ADR-0009) |
| 2 | Iniciar sesión con la cuenta `viewer` | La célula `cell-01` de la planta `demo`, produciendo, con el indicador «En directo» y el nombre del usuario | OpenID Connect con PKCE; la célula de demostración publica por `wss://` hacia el broker de producción (ADR-0008) |
| 3 | Abrir el mismo visor en el móvil, desde la PWA instalada | La misma célula, con el diseño de una columna | Un único despliegue sirve a escritorio y móvil (ADR-0002) |
| 4 | En la pull request, añadir la etiqueta `previsualizacion` | El flujo `Previsualización` crea el entorno `pr-<n>` en unos 2 minutos y comenta en la PR sus direcciones y el resultado de las pruebas | Cada cambio se puede probar en un entorno propio y completo antes de fusionarlo (ADR-0012) |
| 5 | Abrir el visor de la previsualización con el usuario `prueba-e2e` | El cambio de la PR, con su propia célula simulada | El entorno no comparte datos ni secretos con producción |
| 6 | Enseñar el comentario «Plan de Railway» de una PR que cambie `.railway/railway.ts` | Los cambios exactos que se aplicarán en producción | Infraestructura como código: se revisa antes de aplicarse (ADR-0011) |
| 7 | Enseñar el historial del flujo `Railway apply` y de la `Prueba de producción` | Cada fusión aplica el plan y, después, la prueba de extremo a extremo contra producción pasa | Despliegue automático y comprobado; si la prueba falla, se abre una incidencia con los pasos para volver atrás |
| 8 | Explicar la vuelta atrás | `VERSION` en `.railway/railway.ts` vuelve a la etiqueta anterior con un `git revert` | Volver atrás es otro despliegue, de unos dos minutos, sin recompilar ([Despliegue](despliegue.md#volver-atrás)) |
| 9 | Quitar la etiqueta `previsualizacion` | El entorno `pr-<n>` desaparece de Railway | Las previsualizaciones solo cuestan mientras se usan |
| 10 | Si Grafana Cloud está en marcha: abrir el panel «LogicFlows · Producción» | Mensajes por segundo, latencia de ingesta, clientes en tiempo real y estado de la célula | Observabilidad sin entrar en los contenedores (ADR-0013) |
| 11 | Si Grafana Cloud está en marcha: detener el servicio `simulator` en Railway | A los pocos minutos llega por correo la alerta «Célula sin publicar»; al arrancarlo, la de resolución | Las alertas avisan antes de que alguien lo vea en el visor ([qué hacer con cada alerta](../infra/grafana/README.md#alertas)) |

Si Grafana Cloud no está en marcha, los pasos 10 y 11 se sustituyen por los registros del servicio `api` en Railway, filtrando con `@service:api @level:warn`.

## Después de la demo

- Quitar la etiqueta `previsualizacion` si sigue puesta, o cerrar la PR de prueba.
- Si se detuvo el simulador de producción, comprobar que vuelve a publicar: el visor muestra «En directo» y el contador avanza.
