import type { CatalogDataset } from '../catalog-dataset.schema';
import { catalogDatasetSchema } from '../catalog-dataset.schema';
import { categories } from './categories';
import { engineeringItems } from './engineering';
import { seedImages } from './images';
import { materialTypes } from './material-types';
import { options } from './options';
import { products } from './products';
import { roomTypes } from './room-types';
import { styles } from './styles';

export const catalogDataset: CatalogDataset = catalogDatasetSchema.parse({
  images: Object.values(seedImages),
  roomTypes,
  materialTypes,
  categories,
  products,
  styles,
  engineeringItems,
  options,
});
