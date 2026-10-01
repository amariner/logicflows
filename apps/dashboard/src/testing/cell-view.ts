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
    boxesLabel: '42',
    palletsTotal: 1,
    palletLabel: '1 pallet · capa 2 de 5',
    componentsLabel: 'Robot: en movimiento · Cinta: en marcha',
    ...overrides,
  };
}
