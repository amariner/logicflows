-- Mide la ventana de datos de la demo (ADR-0019): tamaño de la base de datos,
-- filas y tamaño de cada tabla, y qué periodo cubre cada una. Solo lee.
--
-- Uso: infra/railway/ejecutar-sql.sh production infra/postgres/medir-ventana.sql
\connect logicflows
\pset pager off
select now() as ahora, pg_size_pretty(pg_database_size(current_database())) as base_de_datos;
select relname as tabla, n_live_tup as filas_vivas, n_dead_tup as filas_muertas,
       pg_size_pretty(pg_total_relation_size(relid)) as tamano, last_autovacuum
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc;
select count(*) as muestras, min(source_timestamp) as primera, max(source_timestamp) as ultima
from telemetry_samples;
select count(*) as cambios_de_estado, min(source_timestamp) as primero from cell_state_changes;
select count(*) as horas_agregadas, min(hour) as primera from cell_hourly;
