// Genera el realm de producción a partir del realm local, que es la única
// fuente de verdad de roles, clientes y políticas (ADR-0010):
// - elimina los usuarios de prueba;
// - toma las direcciones del visor de la variable LOGICFLOWS_VISOR_URL, que
//   Keycloak sustituye al importar el realm.
// Uso: node realm-produccion.mjs <realm local> <realm de producción>
import { readFileSync, writeFileSync } from 'node:fs';

const [source, target] = process.argv.slice(2);
if (source === undefined || target === undefined) {
  throw new Error('Uso: node realm-produccion.mjs <realm local> <realm de producción>');
}

const realm = JSON.parse(readFileSync(source, 'utf8'));
delete realm.users;

const visor = realm.clients?.find((client) => client.clientId === 'logicflows-visor');
if (visor === undefined) {
  throw new Error('El realm no define el cliente logicflows-visor');
}
visor.redirectUris = ['${LOGICFLOWS_VISOR_URL}/*'];
visor.webOrigins = ['${LOGICFLOWS_VISOR_URL}'];
visor.attributes['post.logout.redirect.uris'] = '${LOGICFLOWS_VISOR_URL}/*';

const output = JSON.stringify(realm, null, 2);
if (/"(username|password|credentials)"/.test(output)) {
  throw new Error('El realm de producción no puede contener usuarios ni credenciales');
}
writeFileSync(target, `${output}\n`);
