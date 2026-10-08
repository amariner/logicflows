import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { testProviders } from '../../../../testing/providers';
import { AuthService } from '../../../core/auth/auth';
import { AcknowledgeButtonComponent, acknowledgeError } from './acknowledge-button.component';

const PATH = 'http://api.test/api/v1/sites/demo/cells/cell-03/alarms/ROB-001/acknowledgements';

const render = async (canAcknowledge: boolean) => {
  TestBed.configureTestingModule({
    providers: [
      ...testProviders(),
      { provide: AuthService, useValue: { canAcknowledge: signal(canAcknowledge) } },
    ],
  });
  const fixture = TestBed.createComponent(AcknowledgeButtonComponent);
  fixture.componentRef.setInput('siteId', 'demo');
  fixture.componentRef.setInput('cellId', 'cell-03');
  fixture.componentRef.setInput('code', 'ROB-001');
  fixture.componentRef.setInput('raisedAt', '2026-10-05T08:00:00.000Z');
  await fixture.whenStable();
  return fixture;
};

describe('botón para reconocer una alarma (ADR-0022)', () => {
  it('no aparece si el usuario no puede reconocer', async () => {
    const fixture = await render(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('ion-button')).toBeNull();
  });

  it('reconoce la activación con su raisedAt', async () => {
    const fixture = await render(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector('ion-button');
    expect(button?.textContent.trim()).toBe('Reconocer');
    button?.dispatchEvent(new Event('click'));
    const request = TestBed.inject(HttpTestingController).expectOne(PATH);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ raisedAt: '2026-10-05T08:00:00.000Z' });
    request.flush({});
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')).toBeNull();
  });

  it('explica por qué no se pudo', async () => {
    const fixture = await render(true);
    (fixture.nativeElement as HTMLElement)
      .querySelector('ion-button')
      ?.dispatchEvent(new Event('click'));
    TestBed.inject(HttpTestingController)
      .expectOne(PATH)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toBe(
      'La alarma ya no está activa.',
    );
  });

  it('da un mensaje para cada error', () => {
    expect(acknowledgeError(new HttpErrorResponse({ status: 403 }))).toBe(
      'Tu usuario no puede reconocer alarmas.',
    );
    expect(acknowledgeError(new Error('red'))).toBe(
      'No se pudo reconocer la alarma. Inténtalo de nuevo.',
    );
  });
});
