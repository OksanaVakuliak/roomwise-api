import type {
  Configuration,
  OptionSelection,
  PricingData,
  RoomConfiguration,
} from '../src';

type Random = () => number;

function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function integer(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function decimal(random: Random, min: number, max: number): number {
  const steps = Math.floor((max - min) * 10);
  return Number((min + integer(random, 0, steps) / 10).toFixed(1));
}

function generateRoom(
  random: Random,
  data: PricingData,
  index: number,
): RoomConfiguration {
  const { roomSideM, roomHeightM } = data.limits;
  const sideMax = random() < 0.8 ? Math.min(roomSideM.max, 8) : roomSideM.max;
  return {
    clientId: `room-${index + 1}`,
    roomTypeCode: pick(random, data.roomTypes)
      .code as RoomConfiguration['roomTypeCode'],
    lengthM: decimal(random, roomSideM.min, sideMax),
    widthM: decimal(random, roomSideM.min, sideMax),
    heightM: decimal(random, roomHeightM.min, roomHeightM.max),
    heatedFloor: random() < 0.3,
    selections: data.categories.flatMap((category) => {
      const roll = random();
      if (roll < 0.15) {
        return [];
      }
      const products = data.products.filter(
        (product) => product.categoryId === category.id && product.available,
      );
      return [
        {
          categoryId: category.id,
          productId:
            roll < 0.3 || products.length === 0
              ? null
              : pick(random, products).id,
        },
      ];
    }),
  };
}

function generateOptions(
  random: Random,
  data: PricingData,
  rooms: readonly RoomConfiguration[],
): OptionSelection[] {
  return data.options.flatMap((option) => {
    if (!option.available || random() >= 0.4) {
      return [];
    }
    if (option.unit === 'PIECE') {
      return [
        {
          optionId: option.id,
          quantity: integer(
            random,
            option.minQuantity ?? 1,
            option.maxQuantity ?? 5,
          ),
        },
      ];
    }
    if (option.unit === 'PROJECT') {
      return [{ optionId: option.id }];
    }
    const chosen = rooms.filter(() => random() < 0.5);
    return [
      {
        optionId: option.id,
        roomClientIds: (chosen.length > 0 ? chosen : [rooms[0]]).map(
          (room) => room.clientId,
        ),
      },
    ];
  });
}

export function generateConfigurations(
  pricingData: PricingData,
  seed: number,
  count: number,
): Configuration[] {
  const random = createRandom(seed);
  const { limits } = pricingData;
  return Array.from({ length: count }, () => {
    const totalAreaSqm = decimal(
      random,
      limits.totalAreaSqm.min,
      limits.totalAreaSqm.max,
    );
    const rooms = Array.from(
      { length: integer(random, limits.rooms.min, limits.rooms.max) },
      (_, index) => generateRoom(random, pricingData, index),
    );
    return {
      finishLevel: pick(random, ['ROUGH', 'PRE_FINISH'] as const),
      totalAreaSqm,
      balconyAreaSqm:
        random() < 0.3 ? 0 : decimal(random, 0, Math.min(10, totalAreaSqm)),
      balconyTiles: random() < 0.5,
      kitchenType: pick(random, ['SEPARATE', 'KITCHEN_LIVING'] as const),
      rooms,
      options: generateOptions(random, pricingData, rooms),
      currency: pick(random, ['USD', 'UAH'] as const),
    };
  });
}
