# Spike LF-12: Capacitor sobre un workspace de pnpm

Rama de prueba de concepto para [ADR-0002](docs/adr/0002-visor-multiplataforma.md). **No se fusiona en `main`**: se conserva como evidencia de la decisión.

## Objetivo

Comprobar que la plantilla oficial de Ionic con Angular y Capacitor funciona dentro de un workspace de pnpm con el enlazador aislado por defecto (sin `node-linker=hoisted`):

1. La build web se genera correctamente.
2. `cap sync` resuelve los plugins nativos instalados por pnpm.
3. El proyecto Android compila un APK.

## Contenido

- `package.json` y `pnpm-workspace.yaml`: workspace mínimo con la forma prevista del monorepo.
- `apps/dashboard`: plantilla `blank` de Ionic para Angular (componentes *standalone*) con la integración de Capacitor y la plataforma Android añadida.
- `.github/workflows/spike-android.yml`: instalación, pruebas, lint, build web, `cap sync` y `./gradlew assembleDebug`.

## Reproducir en local

```sh
pnpm install
pnpm --filter dashboard build
pnpm --filter dashboard exec cap sync android
cd apps/dashboard/android && ./gradlew assembleDebug
```

La compilación Android requiere JDK 21 y el Android SDK (API 36). Los resultados están recogidos en el ADR-0002.
