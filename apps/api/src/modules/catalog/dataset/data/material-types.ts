import { PublicationStatus } from '../../../../generated/prisma/enums';
import type { SeedMaterialType } from '../catalog-dataset.schema';

export const materialTypeIds = {
  parquet: '2bc5011d-bc8f-4cec-83ca-1bcd1e367d4a',
  laminate: '9b0a1160-0ea9-4b10-b0d2-4e32eec1945a',
  vinyl: '9c6a8e07-39e3-4af2-a17c-f33978b5d49b',
  ceramicTile: 'cd5fe355-b799-4c81-b766-b2239d85e321',
  porcelainStoneware: 'c83106bd-f5cd-4202-8f2b-8e9140022ed1',
  paint: '6ed8ea14-450a-4a2e-813f-9f4a9d379ee7',
  wallpaper: '1e5cf68d-3903-4830-98d0-8c50c3ca5361',
  mdf: '37b43256-c40d-4ae0-8bf1-1f6bf1bddb22',
  metal: '8863db41-17a2-4087-b969-1813fb7328f6',
  sanitaryCeramics: '53777faf-31d1-4698-9fdc-ae09e563cf98',
} as const;

export const materialTypes: SeedMaterialType[] = [
  {
    id: materialTypeIds.parquet,
    code: 'parquet',
    name: { en: 'Parquet', uk: 'Паркет' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.laminate,
    code: 'laminate',
    name: { en: 'Laminate', uk: 'Ламінат' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.vinyl,
    code: 'vinyl',
    name: { en: 'Vinyl flooring', uk: 'Вінілова підлога' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.ceramicTile,
    code: 'ceramic_tile',
    name: { en: 'Ceramic tile', uk: 'Керамічна плитка' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.porcelainStoneware,
    code: 'porcelain_stoneware',
    name: { en: 'Porcelain stoneware', uk: 'Керамограніт' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.paint,
    code: 'paint',
    name: { en: 'Paint', uk: 'Фарба' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.wallpaper,
    code: 'wallpaper',
    name: { en: 'Wallpaper', uk: 'Шпалери' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.mdf,
    code: 'mdf',
    name: { en: 'MDF', uk: 'МДФ' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.metal,
    code: 'metal',
    name: { en: 'Metal', uk: 'Метал' },
    status: PublicationStatus.PUBLISHED,
  },
  {
    id: materialTypeIds.sanitaryCeramics,
    code: 'sanitary_ceramics',
    name: { en: 'Sanitary ceramics', uk: 'Санітарна кераміка' },
    status: PublicationStatus.PUBLISHED,
  },
];
