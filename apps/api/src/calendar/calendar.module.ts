import { Module } from '@nestjs/common';

import { CalendarController } from './calendar.controller.ts';
import { CalendarRepository } from './calendar.repository.ts';
import { CalendarService } from './calendar.service.ts';

/** Calendario de turnos de cada planta (ADR-0021). */
@Module({
  providers: [CalendarRepository, CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService],
})
export class CalendarModule {}
