-- Spike de LF-76: tamaño y tiempo de consulta del histórico en PostgreSQL.
-- Genera :dias días de telemetría de :celulas células, una muestra cada 10 s
-- (el ritmo del histórico simulado de LF-77), con una sesión por día.
\timing on
\set ON_ERROR_STOP on

insert into telemetry_samples (
  site_id, cell_id, session_id, message_id, schema_version, source_timestamp, received_at,
  seq, boxes_total, pallets_total, current_layer, layers_per_pallet, boxes_in_layer,
  boxes_per_layer, cycle_time_ms, throughput_boxes_per_hour, robot_state, conveyor_state)
select
  'demo',
  'cell-' || lpad(c::text, 2, '0'),
  md5(c::text || '-' || floor(extract(epoch from t) / 86400)::text)::uuid,
  gen_random_uuid(),
  1,
  t,
  t,
  (extract(epoch from t)::bigint % 86400 / 10)::int,
  -- unas 2,5 cajas por muestra, acumuladas dentro de la sesión del día
  (extract(epoch from t)::bigint % 86400 / 4)::int,
  (extract(epoch from t)::bigint % 86400 / 160)::int,
  1, 5, 0, 8, 4000, 900, 'MOVING', 'RUNNING'
from generate_series(1, :celulas) as c,
     generate_series(now() - (:dias || ' days')::interval, now(), interval '10 seconds') as t;

analyze telemetry_samples;

select count(*) as muestras from telemetry_samples;
select pg_size_pretty(pg_relation_size('telemetry_samples')) as datos,
       pg_size_pretty(pg_indexes_size('telemetry_samples')) as indices,
       pg_size_pretty(pg_total_relation_size('telemetry_samples')) as total;

-- La consulta actual de producción por periodo (TelemetryRepository.production).
\echo '== Consulta actual: últimos 30 días de cell-01'
explain (analyze, buffers, costs off)
with samples as (
  select source_timestamp, boxes_total, pallets_total,
         lag(boxes_total) over w as previous_boxes, lag(pallets_total) over w as previous_pallets
  from telemetry_samples
  where site_id = 'demo' and cell_id = 'cell-01' and source_timestamp < now()
  window w as (partition by session_id order by seq)
)
select sum(case when previous_boxes is null or boxes_total < previous_boxes
                then boxes_total else boxes_total - previous_boxes end)
from samples where source_timestamp >= now() - interval '30 days';

\echo '== Consulta actual: último día de cell-01'
explain (analyze, buffers, costs off)
with samples as (
  select source_timestamp, boxes_total,
         lag(boxes_total) over w as previous_boxes
  from telemetry_samples
  where site_id = 'demo' and cell_id = 'cell-01' and source_timestamp < now()
  window w as (partition by session_id order by seq)
)
select sum(case when previous_boxes is null or boxes_total < previous_boxes
                then boxes_total else boxes_total - previous_boxes end)
from samples where source_timestamp >= now() - interval '1 day';

-- Alternativa: agregados por hora (LF-79). Se mide su construcción y la consulta.
\echo '== Construir agregados por hora'
create table telemetry_hourly as
with samples as (
  select site_id, cell_id, source_timestamp, boxes_total,
         lag(boxes_total) over (partition by session_id order by seq) as previous_boxes
  from telemetry_samples
)
select site_id, cell_id, date_trunc('hour', source_timestamp) as hour,
       sum(case when previous_boxes is null or boxes_total < previous_boxes
                then boxes_total else boxes_total - previous_boxes end) as boxes
from samples group by 1, 2, 3;
create unique index on telemetry_hourly (site_id, cell_id, hour);
analyze telemetry_hourly;
select count(*) as horas, pg_size_pretty(pg_total_relation_size('telemetry_hourly')) as tamano
from telemetry_hourly;

\echo '== Agregados: últimos 30 días de cell-01'
explain (analyze, buffers, costs off)
select sum(boxes) from telemetry_hourly
where site_id = 'demo' and cell_id = 'cell-01' and hour >= now() - interval '30 days';
