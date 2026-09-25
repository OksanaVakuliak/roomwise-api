import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const roomTypeIdParamSchema = z.object({
  id: z.uuid(),
});

export class RoomTypeIdParamDto extends createZodDto(roomTypeIdParamSchema) {}
