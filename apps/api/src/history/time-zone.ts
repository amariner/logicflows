// Zonas horarias con desfase de horas enteras: los días se componen de horas
// completas del histórico.

/** Si el instante es medianoche en la zona horaria. */
export const isLocalMidnight = (date: Date, timeZone: string): boolean =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date) === '00:00';

/** El día del instante en la zona horaria, como `2026-10-05`. */
export const localDay = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
