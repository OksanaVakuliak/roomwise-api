import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { CatalogChangeInterceptor } from './common/catalog-change.interceptor';
import { CloudinaryService } from './images/cloudinary.service';
import { ImageUploadInterceptor } from './images/image-upload.interceptor';
import { ImageUrlBuilder } from './images/image-urls';
import { ImagesController } from './images/images.controller';
import { ImagesService } from './images/images.service';
import { MaterialTypesController } from './material-types/material-types.controller';
import { MaterialTypesService } from './material-types/material-types.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { CatalogCache } from './public/catalog-cache';
import { PublicCatalogController } from './public/public-catalog.controller';
import { PublicCatalogService } from './public/public-catalog.service';
import { RoomTypesController } from './room-types/room-types.controller';
import { RoomTypesService } from './room-types/room-types.service';
import { StylesController } from './styles/styles.controller';
import { StylesService } from './styles/styles.service';

@Module({
  controllers: [
    PublicCatalogController,
    ImagesController,
    RoomTypesController,
    CategoriesController,
    MaterialTypesController,
    ProductsController,
    StylesController,
  ],
  providers: [
    PublicCatalogService,
    CatalogCache,
    CatalogChangeInterceptor,
    ImageUrlBuilder,
    CloudinaryService,
    ImagesService,
    ImageUploadInterceptor,
    RoomTypesService,
    CategoriesService,
    MaterialTypesService,
    ProductsService,
    StylesService,
  ],
  exports: [PublicCatalogService, CatalogCache],
})
export class CatalogModule {}
