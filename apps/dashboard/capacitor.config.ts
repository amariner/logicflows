import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android del visor (ADR-0002). El identificador no cambia nunca: para
 * Android, otro identificador es otra aplicación (ADR-0014).
 */
const config: CapacitorConfig = {
  appId: 'io.github.amariner.logicflows',
  appName: 'LogicFlows',
  // La compilación de producción del visor, con config.json de la app
  // (android/config.json) en lugar del de desarrollo: pnpm android:sync.
  webDir: 'www',
  android: {
    // Mismo color que la barra de la PWA mientras carga la vista web.
    backgroundColor: '#17324d',
  },
};

export default config;
