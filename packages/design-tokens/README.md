# @logicflows/design-tokens

Tokens de diseño de LogicFlows: variables CSS compartidas por el visor y el tema de inicio de sesión de Keycloak ([ADR-0020](../../docs/adr/0020-tokens-de-diseno.md)). La dirección visual sale de la [exploración del Hito 5](../../docs/diseno/exploracion-stitch.md).

## Contenido

- **`tokens.css`:** variables semánticas `--lf-…` de color (claro y oscuro), tipografía, espaciado, radios y sombras, y los colores de cada estado de la célula (ADR-0003) y severidad de alarma.
- **`fonts.css`:** Inter (400, 500 y 600) y JetBrains Mono (400 y 600), alfabeto latino en `woff2`, unos 115 kB en total. Licencia SIL Open Font License 1.1.

## Uso

```scss
@import '@logicflows/design-tokens/fonts.css';
@import '@logicflows/design-tokens/tokens.css';

.tarjeta {
  background: var(--lf-color-surface-1);
  color: var(--lf-color-text);
  border-radius: var(--lf-radius-lg);
  padding: var(--lf-space-4);
}
```

Los componentes usan siempre los tokens, nunca valores sueltos. Para un tono de estado, `--lf-state-<estado>-fg` y `--lf-state-<estado>-bg` (`running`, `waiting`, `fault`…).

Algunos colores tienen también su triplete (`--lf-color-primary-rgb: 0, 99, 152`) para usarlos en `rgba()`, como hace Ionic. Una prueba comprueba que coinciden con el color.

## Temas

El tema claro es el de por defecto. El oscuro se aplica con la clase `lf-dark` en `<html>`, o según el sistema si no se ha elegido tema. La clase `lf-light` fuerza el claro.

## Cambiar un token

1. Cambiar el valor en `tokens.css`. Si es un color del tema oscuro, en los dos bloques, que deben ser idénticos.
2. `pnpm --filter @logicflows/design-tokens test` comprueba el contraste WCAG 2.2 AA de cada par de texto y fondo (4,5:1) y de bordes y foco (3:1), en los dos temas.
3. Si cambia el aspecto, la CI pide actualizar las capturas de referencia, incluida la lámina del sistema de diseño del [dosier](../../docs/diseno/dosier.md).
