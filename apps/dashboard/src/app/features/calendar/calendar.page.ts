import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonRouterLink } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addSharp, arrowBackSharp, trashSharp } from 'ionicons/icons';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { CalendarApi } from './calendar.api';
import { WEEKDAYS, toCalendarView } from './calendar-view';
import type { CalendarView } from './calendar-view';
import type { Shift } from './calendar.types';

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly view: CalendarView };

/** Un turno en edición: los campos de un formulario. */
interface DraftShift {
  readonly id: number;
  weekday: number;
  start: number;
  end: number;
  name: string;
}

/** Explica a quien edita por qué la API no aceptó el cambio. */
export function calendarError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { detail?: unknown; errors?: { message?: unknown }[] } | null;
    const messages = (body?.errors ?? [])
      .map((field) => field.message)
      .filter((message): message is string => typeof message === 'string');
    if (messages.length > 0) {
      return [...new Set(messages)].join('. ');
    }
    if (typeof body?.detail === 'string') {
      return body.detail;
    }
    if (error.status === 403) {
      return 'Tu usuario no puede cambiar el calendario.';
    }
  }
  return 'No se pudo guardar el cambio. Inténtalo de nuevo.';
}

/**
 * Calendario de turnos de la planta (LF-127, ADR-0021): los turnos de cada
 * versión por día de la semana y los días sin turnos. Con `admin`, se marcan
 * días sin turnos y se crean versiones futuras: el pasado no se reescribe.
 */
@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonIcon, IonRouterLink, PageHeaderComponent, RouterLink],
})
export class CalendarPage {
  readonly #api = inject(CalendarApi);
  readonly #realtime = inject(RealtimeService);
  readonly #requests = new Subject<string>();
  #nextId = 0;
  protected readonly weekdays = WEEKDAYS;
  protected readonly hours = Array.from({ length: 24 }, (_, hour) => hour);
  protected readonly connection = this.#realtime.connection;
  protected readonly canEdit = inject(AuthService).canAdminister;
  protected readonly state = signal<PageState>({ kind: 'loading' });
  protected readonly status = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly draft = signal<readonly DraftShift[]>([]);
  protected readonly siteId = computed(
    () =>
      [...this.#realtime.cells()]
        .map((cell) => cell.siteId)
        .sort((a, b) => a.localeCompare(b))[0] ?? null,
  );

  constructor() {
    addIcons({ addSharp, arrowBackSharp, trashSharp });
    this.#requests
      .pipe(
        switchMap((siteId) =>
          this.#api.load(siteId).pipe(
            map((calendar): PageState => ({ kind: 'ready', view: toCalendarView(calendar) })),
            catchError(() =>
              of<PageState>({ kind: 'error', message: 'No se pudo cargar el calendario.' }),
            ),
            startWith<PageState>({ kind: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        if (state.kind === 'ready') {
          this.draft.set(state.view.latestShifts.map((shift) => this.#toDraft(shift)));
        }
      });
    effect(() => {
      const siteId = this.siteId();
      if (siteId !== null) {
        this.#requests.next(siteId);
      }
    });
  }

  protected reload(): void {
    const siteId = this.siteId();
    if (siteId !== null) {
      this.#requests.next(siteId);
    }
  }

  protected addShift(): void {
    this.draft.update((shifts) => [
      ...shifts,
      this.#toDraft({ weekday: 1, start: 6, end: 14, name: 'Turno' }),
    ]);
  }

  protected removeShift(id: number): void {
    this.draft.update((shifts) => shifts.filter((shift) => shift.id !== id));
  }

  protected updateShift(
    id: number,
    field: 'weekday' | 'start' | 'end' | 'name',
    value: string,
  ): void {
    this.draft.update((shifts) =>
      shifts.map((shift) =>
        shift.id !== id ? shift : { ...shift, [field]: field === 'name' ? value : Number(value) },
      ),
    );
  }

  protected async saveVersion(effectiveFrom: string, timeZone: string): Promise<void> {
    const shifts = this.draft().map(({ weekday, start, end, name }) => ({
      weekday,
      start,
      end,
      name: name.trim(),
    }));
    await this.#change('Versión guardada.', (siteId) =>
      this.#api.saveVersion(siteId, effectiveFrom, timeZone, shifts),
    );
  }

  protected async deleteVersion(effectiveFrom: string): Promise<void> {
    await this.#change('Versión borrada.', (siteId) =>
      this.#api.deleteVersion(siteId, effectiveFrom),
    );
  }

  protected async saveException(date: string, name: string): Promise<void> {
    await this.#change('Día sin turnos guardado.', (siteId) =>
      this.#api.saveException(siteId, date, name.trim()),
    );
  }

  protected async deleteException(date: string): Promise<void> {
    await this.#change('Día sin turnos quitado.', (siteId) =>
      this.#api.deleteException(siteId, date),
    );
  }

  async #change(done: string, action: (siteId: string) => Promise<unknown>): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null) {
      return;
    }
    this.saving.set(true);
    this.status.set(null);
    this.error.set(null);
    try {
      await action(siteId);
      this.status.set(done);
      this.reload();
    } catch (error) {
      this.error.set(calendarError(error));
    } finally {
      this.saving.set(false);
    }
  }

  #toDraft(shift: Shift): DraftShift {
    return { id: this.#nextId++, ...shift };
  }
}
