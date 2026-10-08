-- Devuelve al disco el espacio que deja la retención tras cargar la ventana de
-- datos (ver «Compactar tras la primera retención» en docs/datos-de-la-demo.md).
-- Se ejecuta una vez, cuando la retención ya ha borrado lo cargado de más.
--
-- Uso: infra/railway/ejecutar-sql.sh production infra/postgres/compactar.sql
\connect logicflows
\pset pager off
\set ON_ERROR_STOP on
select pg_size_pretty(pg_database_size(current_database())) as antes;
-- VACUUM FULL bloquea la tabla mientras la reescribe: si alguien la tiene
-- ocupada, mejor fallar que dejar la ingesta esperando detrás.
set lock_timeout = '10s';
\timing on
vacuum (full, analyze) telemetry_samples;
vacuum (full, analyze) cell_state_changes;
vacuum (full, analyze) cell_hourly;
\timing off
select pg_size_pretty(pg_database_size(current_database())) as despues;
