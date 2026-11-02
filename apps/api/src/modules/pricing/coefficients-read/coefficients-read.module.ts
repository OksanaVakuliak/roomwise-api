import { Module } from '@nestjs/common';
import { CoefficientsReadService } from './coefficients-read.service';

@Module({
  providers: [CoefficientsReadService],
  exports: [CoefficientsReadService],
})
export class CoefficientsReadModule {}
