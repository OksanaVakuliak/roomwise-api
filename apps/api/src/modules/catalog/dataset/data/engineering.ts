import {
  OptionUnit,
  PublicationStatus,
} from '../../../../generated/prisma/enums';
import type { SeedEngineeringPackageItem } from '../catalog-dataset.schema';

export const engineeringItemIds = {
  electricalWiring: '92411198-27d0-4140-ad87-9373afc32345',
  plumbingPipes: '4ce0ff7d-1358-4a19-9504-22033fb162f7',
  ventilation: 'ca9cf10f-e2ac-490c-ad55-aa41849a8f7f',
  heatingRadiators: 'cb242ed9-716f-4cf3-ab5b-3696304a1e73',
} as const;

export const engineeringItems: SeedEngineeringPackageItem[] = [
  {
    id: engineeringItemIds.electricalWiring,
    name: { en: 'Electrical wiring', uk: 'Електропроводка' },
    description: {
      en: 'Full replacement of electrical wiring, sockets and switches throughout the apartment.',
      uk: 'Повна заміна електропроводки, розеток і вимикачів по всій квартирі.',
    },
    includedInBase: true,
    priceCents: null,
    unit: null,
    sortOrder: 0,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: engineeringItemIds.plumbingPipes,
    name: { en: 'Plumbing pipes', uk: 'Сантехнічні труби' },
    description: {
      en: 'Replacement of water supply and drainage pipes to the kitchen and bathroom.',
      uk: 'Заміна труб водопостачання та каналізації до кухні та санвузла.',
    },
    includedInBase: true,
    priceCents: null,
    unit: null,
    sortOrder: 1,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: engineeringItemIds.ventilation,
    name: {
      en: 'Forced ventilation system',
      uk: 'Система примусової вентиляції',
    },
    description: {
      en: 'Supply-and-exhaust ventilation unit with ductwork sized for the whole apartment.',
      uk: 'Приливно-витяжна вентиляційна установка з повітроводами на всю квартиру.',
    },
    includedInBase: false,
    priceCents: 45000,
    unit: OptionUnit.PROJECT,
    sortOrder: 2,
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: engineeringItemIds.heatingRadiators,
    name: { en: 'Heating radiators', uk: 'Опалювальні радіатори' },
    description: {
      en: 'Bimetallic heating radiators with thermostatic valves, installed per room.',
      uk: 'Біметалеві опалювальні радіатори з термостатичними вентилями, встановлені в кожній кімнаті.',
    },
    includedInBase: false,
    priceCents: 3200,
    unit: OptionUnit.PIECE,
    sortOrder: 3,
    status: PublicationStatus.PUBLISHED,
  },
];
