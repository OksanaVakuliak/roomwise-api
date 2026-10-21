import { Inject, Injectable } from '@nestjs/common';
import type { MaintenanceTask } from '../../../common/maintenance/maintenance-task.interface';
import { MaintenanceTaskProvider } from '../../../common/maintenance/maintenance-task-provider.decorator';
import { ExchangeRateService } from './exchange-rate.service';

export const EXCHANGE_RATE_REFRESH_TASK_NAME = 'exchange-rate-refresh';

@MaintenanceTaskProvider()
@Injectable()
export class ExchangeRateRefreshTask implements MaintenanceTask {
  readonly name = EXCHANGE_RATE_REFRESH_TASK_NAME;

  constructor(
    @Inject(ExchangeRateService)
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  isDue(now: Date): Promise<boolean> {
    return this.exchangeRates.isRefreshDue(now);
  }

  run(now: Date): Promise<void> {
    return this.exchangeRates.refresh(now);
  }
}
