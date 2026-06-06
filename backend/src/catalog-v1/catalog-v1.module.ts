import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CatalogV1Service } from './catalog-v1.service';

@Module({
  imports: [HttpModule],
  providers: [CatalogV1Service],
  exports: [CatalogV1Service],
})
export class CatalogV1Module {}
