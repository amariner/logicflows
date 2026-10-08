import type { Routes } from '@angular/router';

import { sessionGuard } from './core/auth/auth';

export const routes: Routes = [
  { path: '', redirectTo: 'cells', pathMatch: 'full' },
  {
    path: 'cells',
    title: 'Células · LogicFlows',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/cells/cells.page').then((m) => m.CellsPage),
  },
  {
    path: 'cells/:siteId/:cellId',
    title: 'Célula · LogicFlows',
    canActivate: [sessionGuard],
    loadComponent: () =>
      import('./features/cells/cell-detail/cell-detail.page').then((m) => m.CellDetailPage),
  },
  {
    path: 'comparison',
    title: 'Comparar células · LogicFlows',
    canActivate: [sessionGuard],
    loadComponent: () =>
      import('./features/comparison/comparison.page').then((m) => m.ComparisonPage),
  },
  {
    path: 'cells/:siteId/:cellId/history',
    title: 'Histórico · LogicFlows',
    canActivate: [sessionGuard],
    loadComponent: () => import('./features/history/history.page').then((m) => m.HistoryPage),
  },
];
