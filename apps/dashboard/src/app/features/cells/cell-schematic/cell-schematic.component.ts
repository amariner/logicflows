import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { CellSchematic } from '../schematic';

/** Alto de una capa del palé en el dibujo, con su separación. */
const LAYER = 16;
const PALLET_TOP = 116;
const PALLET_WIDTH = 76;

/**
 * Esquema de la célula: la cinta trae las cajas, el robot las coge y las deja
 * en el palé, capa a capa (LF-106). El dibujo es decorativo; lo que dice va
 * también en texto debajo, así que no depende del color ni de ver el dibujo.
 */
@Component({
  selector: 'app-cell-schematic',
  template: `
    @let s = schematic();
    <figure>
      <svg viewBox="0 0 320 132" aria-hidden="true" focusable="false">
        <g [class]="'tone-' + s.conveyor.tone">
          <rect class="box" x="30" y="76" width="18" height="18" rx="2" />
          <rect class="box" x="74" y="76" width="18" height="18" rx="2" />
          <rect class="part" x="8" y="96" width="124" height="14" rx="7" />
          @for (x of rollers; track x) {
            <circle class="roller" [attr.cx]="x" cy="103" r="3" />
          }
        </g>
        <g [class]="'tone-' + s.robot.tone">
          <rect class="part" x="150" y="104" width="44" height="12" rx="2" />
          <rect class="part" x="166" y="60" width="12" height="44" rx="2" />
          <line class="arm" x1="172" y1="64" x2="250" y2="20" />
          <line class="arm gripper" x1="250" y1="20" x2="250" y2="30" />
          <circle class="joint" cx="172" cy="64" r="7" />
        </g>
        <g class="pallet">
          @for (layer of layers(); track layer.index) {
            <rect
              class="layer"
              [class.done]="layer.state === 'done'"
              [class.pending]="layer.state !== 'done'"
              x="236"
              [attr.y]="layer.y"
              [attr.width]="width"
              height="14"
              rx="2"
            />
            @if (layer.state === 'current') {
              <rect
                class="layer done"
                x="236"
                [attr.y]="layer.y"
                [attr.width]="layer.fill"
                height="14"
                rx="2"
              />
            }
          }
          <rect class="base" x="232" y="118" width="84" height="8" rx="1" />
        </g>
      </svg>
      <figcaption>
        <ul>
          @for (part of [s.conveyor, s.robot]; track part.name) {
            <li [class]="'tone-' + part.tone">
              <span class="dot" aria-hidden="true"></span>
              <strong>{{ part.name }}</strong> {{ part.label }}
            </li>
          }
          <li class="tone-info">
            <span class="dot" aria-hidden="true"></span>
            <strong>Palé</strong> {{ s.pallet.label }}
          </li>
        </ul>
      </figcaption>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    svg {
      display: block;
      width: 100%;
      max-width: 32rem;
      height: auto;
      margin: 0 auto;
    }
    .part,
    .joint {
      fill: var(--bg);
      stroke: var(--fg);
      stroke-width: 2;
    }
    .roller {
      fill: var(--fg);
    }
    .box {
      fill: var(--lf-color-surface-3);
      stroke: var(--lf-color-text-muted);
      stroke-width: 1.5;
    }
    .arm {
      stroke: var(--fg);
      stroke-width: 8;
      stroke-linecap: round;
    }
    .gripper {
      stroke-width: 5;
    }
    .layer.done {
      fill: var(--lf-color-primary);
    }
    .layer.pending {
      fill: none;
      stroke: var(--lf-color-border-strong);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
    .base {
      fill: var(--lf-color-neutral-bg);
      stroke: var(--lf-color-text-muted);
      stroke-width: 1.5;
    }
    ul {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--lf-space-2) var(--lf-space-6);
      margin: var(--lf-space-3) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--lf-font-size-sm);
      color: var(--lf-color-text);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--lf-space-2);
    }
    .dot {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--lf-radius-full);
      background: var(--fg);
    }
    .tone-ok {
      --fg: var(--lf-color-ok-fg);
      --bg: var(--lf-color-ok-bg);
    }
    .tone-info {
      --fg: var(--lf-color-primary);
      --bg: var(--lf-color-info-bg);
    }
    .tone-neutral {
      --fg: var(--lf-color-neutral-fg);
      --bg: var(--lf-color-neutral-bg);
    }
    .tone-warning {
      --fg: var(--lf-color-warning-fg);
      --bg: var(--lf-color-warning-bg);
    }
    .tone-danger {
      --fg: var(--lf-color-danger-fg);
      --bg: var(--lf-color-danger-bg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CellSchematicComponent {
  readonly schematic = input.required<CellSchematic>();
  protected readonly rollers = [18, 38, 58, 78, 98, 118];
  protected readonly width = PALLET_WIDTH;

  /** Capas de abajo arriba: terminadas, la que está en curso y las que faltan. */
  protected readonly layers = computed(() => {
    const { layers, currentLayer, layerProgress } = this.schematic().pallet;
    return Array.from({ length: layers }, (_, index) => ({
      index,
      y: PALLET_TOP - (index + 1) * LAYER,
      state: index < currentLayer - 1 ? 'done' : index === currentLayer - 1 ? 'current' : 'pending',
      fill: PALLET_WIDTH * layerProgress,
    }));
  });
}
