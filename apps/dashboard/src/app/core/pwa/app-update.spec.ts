import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import type { VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AppUpdateService } from './app-update';

const setup = (isEnabled: boolean) => {
  const versionUpdates = new Subject<VersionEvent>();
  TestBed.configureTestingModule({
    providers: [{ provide: SwUpdate, useValue: { isEnabled, versionUpdates } }],
  });
  return { service: TestBed.inject(AppUpdateService), versionUpdates };
};

const version = { hash: 'abc', appData: {} };

describe('aviso de versión nueva', () => {
  it('avisa cuando hay una versión nueva lista para activarse', () => {
    const { service, versionUpdates } = setup(true);
    versionUpdates.next({ type: 'VERSION_DETECTED', version });
    expect(service.available()).toBe(false);
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: version, latestVersion: version });
    expect(service.available()).toBe(true);
  });

  it('sin service worker no avisa nunca', () => {
    const { service } = setup(false);
    expect(service.available()).toBe(false);
  });
});
