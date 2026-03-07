import { Module } from '@nestjs/common'
import { ProjectService } from './project.service'
import { ProjectController } from './project.controller'
import { PrismaClient } from '@prisma/client'

@Module({
  controllers: [ProjectController],
  providers: [ProjectService, PrismaClient],
})
export class ProjectModule {}
