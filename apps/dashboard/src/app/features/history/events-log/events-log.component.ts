import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudDoneSharp,
  cloudOfflineSharp,
  handLeftSharp,
  hourglassSharp,
  informationCircleSharp,
  pauseSharp,
  playSharp,
  stopSharp,
  syncSharp,
  warningSharp,
} from 'ionicons/icons';

import type { EventsView } from '../events-view';

/**
 * Registro de estados, alarmas y conexión de una célula (LF-84), del más
 * reciente al más antiguo. Cada entrada combina icono, texto y color, como el
 * panel de estado (docs/diseno-del-visor.md).
 */
@Component({
  selector: 'app-events-log',
  templateUrl: './events-log.component.html',
  styleUrl: './events-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
})
export class EventsLogComponent {
  readonly view = input.required<EventsView>();

  constructor() {
    addIcons({
      cloudDoneSharp,
      cloudOfflineSharp,
      handLeftSharp,
      hourglassSharp,
      informationCircleSharp,
      pauseSharp,
      playSharp,
      stopSharp,
      syncSharp,
      warningSharp,
    });
  }
}
