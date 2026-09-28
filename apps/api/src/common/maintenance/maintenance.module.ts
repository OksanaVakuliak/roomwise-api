import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceRegistry } from './maintenance-registry';
import { MaintenanceTokenGuard } from './maintenance-token.guard';

@Module({
  imports: [DiscoveryModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceRegistry, MaintenanceTokenGuard],
  exports: [MaintenanceRegistry],
})
export class MaintenanceModule {}
