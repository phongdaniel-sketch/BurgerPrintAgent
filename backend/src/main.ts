import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { setupSwagger } from './setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;

  setupSwagger(app);

  await app.listen(port);
  Logger.log(`🚀 Backend listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // Lỗi bootstrap (vd env validation thất bại) — fail-fast với thông báo rõ ràng.
  Logger.error(
    `Bootstrap thất bại: ${err?.message ?? err}`,
    undefined,
    'Bootstrap',
  );
  process.exit(1);
});
