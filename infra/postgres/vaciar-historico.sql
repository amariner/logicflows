-- Vacía el histórico de la base de datos de la API antes de cargar la ventana
-- de la demo (ADR-0019, infra/railway/cargar-ventana.sh). Conserva los
-- dispositivos registrados para los avisos y el registro de migraciones.
\connect logicflows
truncate
  telemetry_samples,
  cell_state_changes,
  cell_status_events,
  cell_hourly,
  cell_hourly_pending,
  push_notified_alarms;
