import { Module } from '@nestjs/common';
import { Clock } from '../auth/clock';
import { ImageUrlBuilder } from './images/image-urls';
import { CatalogCache } from './public/catalog-cache';
import { PublicCatalogController } from './public/public-catalog.controller';
import { PublicCatalogService } from './public/public-catalog.service';

@Module({
  controllers: [PublicCatalogController],
  providers: [PublicCatalogService, CatalogCache, ImageUrlBuilder, Clock],
  exports: [PublicCatalogService, CatalogCache],
})
export class CatalogModule {}
