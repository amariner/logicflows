import { describe, expect, it } from 'vitest';

import { VirtualClock } from './virtual-clock.ts';

describe('reloj virtual', () => {
  it('ejecuta los temporizadores vencidos en orden, con su hora', () => {
    const clock = new VirtualClock(1_000);
    const log: string[] = [];
    clock.after(300, () => log.push(`b@${String(clock.now())}`));
    clock.after(100, () => log.push(`a@${String(clock.now())}`));
    clock.after(500, () => log.push('c'));
    clock.runUntil(1_400);
    expect(log).toEqual(['a@1100', 'b@1300']);
    expect(clock.now()).toBe(1_400);
  });

  it('a igualdad de hora, respeta el orden en que se programaron', () => {
    const clock = new VirtualClock(0);
    const log: number[] = [];
    clock.after(10, () => log.push(1));
    clock.after(10, () => log.push(2));
    clock.runUntil(10);
    expect(log).toEqual([1, 2]);
  });

  it('repite los intervalos y ejecuta los temporizadores programados durante el avance', () => {
    const clock = new VirtualClock(0);
    const ticks: number[] = [];
    clock.every(1_000, () => {
      ticks.push(clock.now());
      if (clock.now() === 2_000) {
        clock.after(500, () => ticks.push(clock.now()));
      }
    });
    clock.runUntil(3_000);
    expect(ticks).toEqual([1_000, 2_000, 2_500, 3_000]);
  });

  it('un temporizador cancelado no se ejecuta', () => {
    const clock = new VirtualClock(0);
    let ran = false;
    const timer = clock.after(10, () => {
      ran = true;
    });
    timer.cancel();
    clock.runUntil(100);
    expect(ran).toBe(false);
  });
});
