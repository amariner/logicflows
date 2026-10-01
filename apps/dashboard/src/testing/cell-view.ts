import type { CellView } from '../app/features/cells/cell-view';

/** Vista de célula válida para pruebas de componentes. */
export function buildCellView(overrides: Partial<CellView> = {}): CellView {
  return {
    id: 'demo/cell-01',
    siteId: 'demo',
    cellId: 'cell-01',
    online: true,
    state: 'RUNNING',
    stateLabel: 'Produciendo',
    stateIcon: 'play-sharp',
    stateTone: 'ok',
    attention: false,
    alarms: [],
    boxesTotal: 42,
    indicators: {
      boxes: '42',
      pallets: '1',
      layer: '2 de 5',
      palletProgress: 0.25,
      palletProgressLabel: 'Pallet en curso: 10 de 40 cajas',
      throughput: { value: '820', unit: 'cajas/h' },
      cycleTime: { value: '4,2', unit: 's' },
    },
    componentsLabel: 'Robot: en movimiento · Cinta: en marcha',
    ...overrides,
  };
}
