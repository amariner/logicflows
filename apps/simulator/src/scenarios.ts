import type { DailyScript } from './daily-script.ts';
import { GUION_DIARIO } from './guion-diario.ts';

/** Intervalo de duración, en milisegundos. */
export interface DurationRange {
  readonly minMs: number;
  readonly maxMs: number;
}

/** Frecuencia de cada incidencia, en veces por hora de simulación. */
export interface IncidentRates {
  readonly faultPerHour: number;
  readonly emergencyStopPerHour: number;
  readonly starvedPerHour: number;
  readonly blockedPerHour: number;
  readonly pausePerHour: number;
  readonly supplyDuration: DurationRange;
  readonly pauseDuration: DurationRange;
}

/** Problemas de red entre la célula y el broker. */
export interface NetworkChaos {
  /** Cortes de conexión por hora. */
  readonly disconnectPerHour: number;
  readonly disconnectDuration: DurationRange;
  /** Probabilidad de enviar un mensaje dos veces, como un reintento de QoS 1. */
  readonly duplicateProbability: number;
  /** Probabilidad de retrasar un mensaje para que llegue desordenado. */
  readonly delayProbability: number;
  readonly delay: DurationRange;
}

export interface Scenario {
  readonly description: string;
  readonly incidents: IncidentRates | null;
  readonly network: NetworkChaos | null;
  /** Guion diario: incidencias a hora fija en lugar de al azar (ADR-0019). */
  readonly script?: DailyScript;
}

const minutes = (value: number) => value * 60_000;
const seconds = (value: number) => value * 1_000;

export const SCENARIOS = {
  guion: {
    description:
      'La demo para compradores: cada día repite el mismo guion de esperas, pausas y fallos a hora local, con alarmas graves en horario laboral (ADR-0019).',
    incidents: null,
    network: null,
    script: GUION_DIARIO,
  },
  normal: {
    description: 'Producción continua, sin incidencias ni problemas de red.',
    incidents: null,
    network: null,
  },
  turno: {
    description:
      'Un turno realista: esperas por falta de cajas o salida ocupada varias veces por hora, alguna pausa y fallos ocasionales.',
    incidents: {
      faultPerHour: 1,
      emergencyStopPerHour: 0.2,
      starvedPerHour: 4,
      blockedPerHour: 2,
      pausePerHour: 1,
      supplyDuration: { minMs: seconds(30), maxMs: minutes(3) },
      pauseDuration: { minMs: minutes(1), maxMs: minutes(5) },
    },
    network: null,
  },
  averias: {
    description:
      'Una célula con problemas: fallos y paradas de emergencia frecuentes además de las esperas habituales.',
    incidents: {
      faultPerHour: 12,
      emergencyStopPerHour: 3,
      starvedPerHour: 6,
      blockedPerHour: 6,
      pausePerHour: 1,
      supplyDuration: { minMs: seconds(20), maxMs: minutes(2) },
      pauseDuration: { minMs: minutes(1), maxMs: minutes(3) },
    },
    network: null,
  },
  'red-inestable': {
    description:
      'Producción normal con una red de planta poco fiable: cortes de conexión, mensajes duplicados y mensajes desordenados.',
    incidents: null,
    network: {
      disconnectPerHour: 6,
      disconnectDuration: { minMs: seconds(5), maxMs: seconds(30) },
      duplicateProbability: 0.1,
      delayProbability: 0.05,
      delay: { minMs: 500, maxMs: seconds(3) },
    },
  },
  demo: {
    description:
      'Para demostraciones: todas las incidencias y problemas de red con frecuencia, para ver cada estado en pocos minutos.',
    incidents: {
      faultPerHour: 30,
      emergencyStopPerHour: 10,
      starvedPerHour: 30,
      blockedPerHour: 20,
      pausePerHour: 10,
      supplyDuration: { minMs: seconds(10), maxMs: seconds(30) },
      pauseDuration: { minMs: seconds(10), maxMs: seconds(30) },
    },
    network: {
      disconnectPerHour: 4,
      disconnectDuration: { minMs: seconds(5), maxMs: seconds(15) },
      duplicateProbability: 0.05,
      delayProbability: 0.02,
      delay: { minMs: 500, maxMs: seconds(2) },
    },
  },
} as const satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as [ScenarioName, ...ScenarioName[]];
