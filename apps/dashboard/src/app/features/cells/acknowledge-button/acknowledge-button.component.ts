import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkSharp } from 'ionicons/icons';

import { AuthService } from '../../../core/auth/auth';
import { AlarmsApi } from '../alarms.api';

/** Mensaje para quien pulsó «Reconocer» si no se pudo. */
export function acknowledgeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 409) {
      return 'La alarma ya no está activa.';
    }
    if (error.status === 403) {
      return 'Tu usuario no puede reconocer alarmas.';
    }
  }
  return 'No se pudo reconocer la alarma. Inténtalo de nuevo.';
}

/**
 * Botón para reconocer una alarma activa (ADR-0022). Solo aparece si el
 * usuario es `operator` o `admin`: la API lo vuelve a comprobar. Reconocer no
 * resuelve la alarma; dice a los demás que alguien la atiende.
 */
@Component({
  selector: 'app-acknowledge-button',
  template: `
    @if (allowed()) {
      <ion-button
        class="acknowledge"
        size="small"
        fill="outline"
        [disabled]="pending()"
        [attr.aria-label]="'Reconocer la alarma ' + code() + ' de ' + cellId()"
        (click)="acknowledge()"
      >
        <ion-icon slot="start" aria-hidden="true" name="checkmark-sharp" />
        {{ pending() ? 'Reconociendo…' : 'Reconocer' }}
      </ion-button>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: var(--lf-space-2);
    }
    ion-button {
      margin: 0;
    }
    .error {
      margin: var(--lf-space-1) 0 0;
      color: var(--lf-color-danger-fg);
      font-size: var(--lf-font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon],
})
export class AcknowledgeButtonComponent {
  readonly siteId = input.required<string>();
  readonly cellId = input.required<string>();
  readonly code = input.required<string>();
  readonly raisedAt = input.required<string>();

  readonly #api = inject(AlarmsApi);
  protected readonly allowed = inject(AuthService).canAcknowledge;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    addIcons({ checkmarkSharp });
  }

  protected async acknowledge(): Promise<void> {
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.#api.acknowledge(this.siteId(), this.cellId(), this.code(), this.raisedAt());
    } catch (error) {
      this.error.set(acknowledgeError(error));
    } finally {
      this.pending.set(false);
    }
  }
}
