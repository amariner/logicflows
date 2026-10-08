-- Calendario de turnos de la planta de la demo (ADR-0021): mañana de 06:00 a
-- 14:00 y tarde de 14:00 a 22:00, de lunes a viernes, hora de Madrid. Las
-- noches y los fines de semana quedan fuera de turno, así que la demo enseña
-- las dos reglas.
--
-- Uso: infra/railway/ejecutar-sql.sh production infra/postgres/calendario-demo.sql
--
-- Escribe directamente, sin pasar por la API, porque no hay un usuario admin
-- de la demo. Respeta su regla: la versión entra en vigor en una fecha futura
-- (el lunes 12 de octubre de 2026). Si ya existe, no hace nada.
\connect logicflows
begin;
insert into shift_calendar_versions
  (site_id, effective_from, time_zone, created_by, created_by_name, created_at)
values ('demo', '2026-10-12', 'Europe/Madrid', 'logicflows', 'logicflows', now())
on conflict do nothing;
insert into shift_calendar_shifts (site_id, effective_from, weekday, start_hour, end_hour, name)
select 'demo', '2026-10-12', weekday, start_hour, end_hour, name
from generate_series(1, 5) as weekday,
  (values (6, 14, 'Mañana'), (14, 22, 'Tarde')) as shift(start_hour, end_hour, name)
on conflict do nothing;
commit;
select effective_from, time_zone, count(*) as turnos
from shift_calendar_versions join shift_calendar_shifts using (site_id, effective_from)
where site_id = 'demo'
group by effective_from, time_zone;
