import { PricingDataSchema } from '@roomwise/calc-engine';
import { createZodDto } from 'nestjs-zod';

export class PricingDataResponseDto extends createZodDto(PricingDataSchema) {}
