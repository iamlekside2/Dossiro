import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import express from 'express';
import { AppModule } from './app.module';
import type { AppConfig } from './common/config/configuration';

// BigInt does not survive JSON.stringify, and sizeBytes is a BigInt. Without
// this every document response throws "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's own body parser would consume the stream before we can keep the
    // raw bytes, and WhatsApp's signature is computed over those exact bytes.
    bodyParser: false,
  });

  const config = app.get(ConfigService<{ app: AppConfig }, true>);
  const cfg = config.get('app', { infer: true });

  // Capture the raw buffer alongside the parsed body, for webhook signatures.
  const keepRaw = (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  };
  app.use(express.json({ limit: '10mb', verify: keepRaw }));
  app.use(express.urlencoded({ extended: true, limit: '10mb', verify: keepRaw }));
  // Inbound mail arrives as a raw MIME body rather than JSON.
  app.use(express.raw({ type: ['message/rfc822', 'text/plain'], limit: '50mb', verify: keepRaw }));

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      // Documents are streamed to the browser for inline viewing; the default
      // CORP header would block the viewer from rendering them.
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: cfg.isProd ? undefined : false,
    }),
  );

  app.enableCors({
    origin: cfg.corsOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  // Behind a load balancer, so req.ip reflects the client rather than the proxy.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown fields outright rather than silently dropping them, so
      // a typo in a client payload surfaces instead of being ignored.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Nest closes the pool through DatabaseService's OnModuleDestroy.
  app.enableShutdownHooks();

  if (!cfg.isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('Dossiro API')
      .setDescription('Enterprise document management: storage, access control, sharing, channels.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
    logger.log(`API docs at ${cfg.apiBaseUrl}/api/docs`);
  }

  await app.listen(cfg.port);
  logger.log(`Dossiro API listening on ${cfg.apiBaseUrl} (${cfg.env})`);
}

void bootstrap();
