import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BurgerPrintsService } from './burgerprints.service';
import { CatalogV1Module } from '../catalog-v1/catalog-v1.module';

@Module({
  imports: [HttpModule, CatalogV1Module],
  providers: [BurgerPrintsService],
  exports: [BurgerPrintsService],
})
export class BurgerPrintsModule {}
