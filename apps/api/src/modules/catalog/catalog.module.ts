import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { CloudinaryService } from './images/cloudinary.service';
import { ImageUploadInterceptor } from './images/image-upload.interceptor';
import { ImageUrlBuilder } from './images/image-urls';
import { ImagesController } from './images/images.controller';
import { ImagesService } from './images/images.service';
import { MaterialTypesController } from './material-types/material-types.controller';
import { MaterialTypesService } from './material-types/material-types.service';
import { CatalogCache } from './public/catalog-cache';
import { PublicCatalogController } from './public/public-catalog.controller';
import { PublicCatalogService } from './public/public-catalog.service';
import { RoomTypesController } from './room-types/room-types.controller';
import { RoomTypesService } from './room-types/room-types.service';

@Module({
  controllers: [
    PublicCatalogController,
    ImagesController,
    RoomTypesController,
    CategoriesController,
    MaterialTypesController,
  ],
  providers: [
    PublicCatalogService,
    CatalogCache,
    ImageUrlBuilder,
    CloudinaryService,
    ImagesService,
    ImageUploadInterceptor,
    RoomTypesService,
    CategoriesService,
    MaterialTypesService,
  ],
  exports: [PublicCatalogService, CatalogCache],
})
export class CatalogModule {}
