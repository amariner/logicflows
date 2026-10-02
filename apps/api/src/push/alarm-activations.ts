import type { StateMessage } from '@logicflows/contract';

/** Gravedad de una activación que avisa en el móvil (ADR-0015). */
export type NotifiedSeverity = 'CRITICAL' | 'HIGH';

/**
 * Código de la activación que representa la entrada en parada de emergencia
 * cuando la célula no informa de ninguna alarma crítica que la explique.
 */
export const EMERGENCY_STOP_CODE = 'EMERGENCY_STOP';

/**
 * Una activación de una alarma: la terna célula, código y momento en que se
 * activó. Se avisa una sola vez por activación (ADR-0015).
 */
export interface AlarmActivation {
  readonly siteId: string;
  readonly cellId: string;
  readonly code: string;
  readonly raisedAt: string;
  readonly severity: NotifiedSeverity;
}

const isNotified = (severity: string): severity is NotifiedSeverity =>
  severity === 'CRITICAL' || severity === 'HIGH';

/**
 * Activaciones de un mensaje `state` que deben avisar: las alarmas
 * `CRITICAL` y `HIGH` activas y la parada de emergencia. Si la célula ya
 * informa de una alarma crítica, como la de la seta de emergencia, la parada
 * no añade otro aviso.
 */
export function activationsToNotify(message: StateMessage): AlarmActivation[] {
  const cell = { siteId: message.siteId, cellId: message.cellId };
  const activations: AlarmActivation[] = [];
  for (const alarm of message.activeAlarms) {
    if (isNotified(alarm.severity)) {
      activations.push({
        ...cell,
        code: alarm.code,
        raisedAt: alarm.raisedAt,
        severity: alarm.severity,
      });
    }
  }
  const explained = activations.some((activation) => activation.severity === 'CRITICAL');
  if (message.state === 'EMERGENCY_STOP' && !explained) {
    activations.push({
      ...cell,
      code: EMERGENCY_STOP_CODE,
      raisedAt: message.since,
      severity: 'CRITICAL',
    });
  }
  return activations;
}

/**
 * Antigüedad máxima de una activación para avisar. Una alarma de hace más
 * tiempo no sirve como aviso: llega por un histórico cargado (LF-77) o por
 * mensajes retenidos tras una caída larga de la API.
 */
export const MAX_NOTIFICATION_AGE_MS = 15 * 60_000;

export const isRecent = (activation: AlarmActivation, nowMs: number): boolean =>
  nowMs - Date.parse(activation.raisedAt) <= MAX_NOTIFICATION_AGE_MS;

/** Contenido de un aviso. Nunca lleva el texto de la alarma (ADR-0015). */
export interface PushNotification {
  readonly title: string;
  readonly body: string;
  /** Para abrir la célula al tocar el aviso. */
  readonly data: { readonly siteId: string; readonly cellId: string };
  /** Un aviso por célula sustituye al anterior. */
  readonly collapseKey: string;
}

export function notificationFor(activation: AlarmActivation): PushNotification {
  return {
    title:
      activation.severity === 'CRITICAL'
        ? 'Alarma crítica en LogicFlows'
        : 'Alarma alta en LogicFlows',
    body: `${activation.siteId} / ${activation.cellId}`,
    data: { siteId: activation.siteId, cellId: activation.cellId },
    collapseKey: `${activation.siteId}/${activation.cellId}`,
  };
}
