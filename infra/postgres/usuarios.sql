-- Usuarios y bases de datos de LogicFlows en un servidor PostgreSQL compartido
-- (LF-48): la API y Keycloak tienen cada uno su usuario y su base de datos, y
-- ninguno puede conectarse a la del otro.
--
-- Idempotente: crea lo que falte y fija las contraseñas, así que también sirve
-- para rotarlas. Se ejecuta con psql como administrador del servidor:
--   psql -v ON_ERROR_STOP=1 \
--        -v api_password="$API_DB_PASSWORD" \
--        -v keycloak_password="$KEYCLOAK_DB_PASSWORD" \
--        -f infra/postgres/usuarios.sql

-- Dos ejecuciones a la vez comprobarían las dos que falta un usuario e
-- intentarían crearlo (lo hace el servicio temporal de ejecutar-sql.sh, que
-- puede arrancar dos veces). El bloqueo las ejecuta una tras otra; se libera
-- al cerrar la sesión.
SELECT pg_advisory_lock(hashtext('logicflows-usuarios'));

SELECT 'CREATE ROLE logicflows LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'logicflows') \gexec
SELECT 'CREATE ROLE keycloak LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') \gexec

ALTER ROLE logicflows WITH LOGIN PASSWORD :'api_password';
ALTER ROLE keycloak WITH LOGIN PASSWORD :'keycloak_password';

SELECT 'CREATE DATABASE logicflows OWNER logicflows'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logicflows') \gexec
SELECT 'CREATE DATABASE keycloak OWNER keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak') \gexec

-- Por defecto cualquier usuario puede conectarse a cualquier base de datos.
REVOKE CONNECT ON DATABASE logicflows FROM PUBLIC;
REVOKE CONNECT ON DATABASE keycloak FROM PUBLIC;
