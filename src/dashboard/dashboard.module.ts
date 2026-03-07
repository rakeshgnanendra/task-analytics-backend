import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { PrismaClient } from '@prisma/client'

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PrismaClient],
})
export class DashboardModule {}
