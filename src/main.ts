import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { join } from 'path'
import { NestExpressApplication } from '@nestjs/platform-express'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.useStaticAssets(
    join(process.cwd(), 'uploads'),
    {
      prefix: '/uploads/',
    },
  )
  app.enableCors({
    origin: 'http://localhost:5173', // React app URL
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()