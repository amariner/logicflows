import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'cells', pathMatch: 'full' },
  {
    path: 'cells',
    title: 'Células · LogicFlows',
    loadComponent: () => import('./features/cells/cells.page').then((m) => m.CellsPage),
  },
];
