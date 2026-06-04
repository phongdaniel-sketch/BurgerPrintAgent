import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BurgerPrintsService } from './burgerprints.service';

@Module({
  imports: [HttpModule],
  providers: [BurgerPrintsService],
  exports: [BurgerPrintsService],
})
export class BurgerPrintsModule {}
