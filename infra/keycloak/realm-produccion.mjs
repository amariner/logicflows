// Genera el realm de producción a partir del realm local, que es la única
// fuente de verdad de roles, clientes y políticas (ADR-0010):
// - elimina los usuarios de prueba;
// - toma las direcciones del visor de la variable LOGICFLOWS_VISOR_URL, que
//   Keycloak sustituye al importar el realm.
// Con --previsualizacion genera el realm de las previsualizaciones por pull
// request (ADR-0012): el de producción más el usuario de solo lectura de la
// prueba de extremo a extremo, con la contraseña de LOGICFLOWS_E2E_PASSWORD.
// Uso: node realm-produccion.mjs <realm local> <realm generado> [--previsualizacion]
import { readFileSync, writeFileSync } from 'node:fs';

const [source, target, mode] = process.argv.slice(2);
if (source === undefined || target === undefined) {
  throw new Error(
    'Uso: node realm-produccion.mjs <realm local> <realm generado> [--previsualizacion]',
  );
}
if (mode !== undefined && mode !== '--previsualizacion') {
  throw new Error(`Opción desconocida: ${mode}`);
}

const realm = JSON.parse(readFileSync(source, 'utf8'));
delete realm.users;

const visor = realm.clients?.find((client) => client.clientId === 'logicflows-visor');
if (visor === undefined) {
  throw new Error('El realm no define el cliente logicflows-visor');
}
// La app Android (LF-68) vuelve por su esquema propio (RFC 8252) y su vista
// web tiene el origen https://localhost, que necesita para pedir los tokens.
const APP_SCHEME_URIS = 'io.github.amariner.logicflows:/*';
visor.redirectUris = ['${LOGICFLOWS_VISOR_URL}/*', APP_SCHEME_URIS];
visor.webOrigins = ['${LOGICFLOWS_VISOR_URL}', 'https://localhost'];
// Keycloak separa con ## las direcciones de este atributo.
visor.attributes['post.logout.redirect.uris'] = `\${LOGICFLOWS_VISOR_URL}/*##${APP_SCHEME_URIS}`;

const production = JSON.stringify(realm, null, 2);
if (/"(username|password|credentials)"/.test(production)) {
  throw new Error('El realm de producción no puede contener usuarios ni credenciales');
}

if (mode === '--previsualizacion') {
  // Perfil completo y email verificado: Keycloak no pide completar datos en el
  // primer acceso (VERIFY_PROFILE) y la prueba entra directamente.
  realm.users = [
    {
      username: 'prueba-e2e',
      firstName: 'Prueba',
      lastName: 'de extremo a extremo',
      email: 'prueba-e2e@logicflows.local',
      emailVerified: true,
      enabled: true,
      credentials: [{ type: 'password', value: '${LOGICFLOWS_E2E_PASSWORD}', temporary: false }],
      realmRoles: ['viewer'],
    },
  ];
}

writeFileSync(target, `${JSON.stringify(realm, null, 2)}\n`);
