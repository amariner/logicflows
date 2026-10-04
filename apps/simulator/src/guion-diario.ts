import type { DailyScript } from './daily-script.ts';

/**
 * Guion diario de la célula de la demo (ADR-0019): tres turnos de producción
 * con sus esperas, pausas y fallos, a horas locales de Madrid. Se repite cada
 * día. Las alarmas graves (ROB-001, ROB-002 y la parada de emergencia) caen en
 * horario laboral, para enseñar un aviso en el móvil durante una demo.
 */
export const GUION_DIARIO: DailyScript = {
  timeZone: 'Europe/Madrid',
  incidents: [
    // Turno de noche.
    { at: '01:10', kind: 'starved', minutes: 4 },
    { at: '02:45', kind: 'blocked', minutes: 3 },
    { at: '04:00', kind: 'pause', minutes: 15 },
    { at: '05:20', kind: 'fault', alarm: 'CONV-002' },
    // Turno de mañana.
    { at: '06:00', kind: 'pause', minutes: 10 },
    { at: '07:35', kind: 'starved', minutes: 3 },
    { at: '08:50', kind: 'blocked', minutes: 2 },
    { at: '09:47', kind: 'fault', alarm: 'ROB-002' },
    { at: '10:30', kind: 'pause', minutes: 15 },
    { at: '11:15', kind: 'emergencyStop' },
    { at: '12:20', kind: 'starved', minutes: 5 },
    { at: '13:05', kind: 'fault', alarm: 'CONV-002' },
    // Turno de tarde.
    { at: '14:00', kind: 'pause', minutes: 10 },
    { at: '15:25', kind: 'blocked', minutes: 4 },
    { at: '16:40', kind: 'fault', alarm: 'ROB-001' },
    { at: '17:30', kind: 'starved', minutes: 2 },
    { at: '18:30', kind: 'pause', minutes: 15 },
    { at: '19:10', kind: 'blocked', minutes: 3 },
    { at: '20:05', kind: 'fault', alarm: 'ROB-002' },
    { at: '21:20', kind: 'starved', minutes: 3 },
    { at: '22:00', kind: 'pause', minutes: 10 },
    { at: '23:15', kind: 'blocked', minutes: 2 },
  ],
};
