import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { ReportsService } from './reports.service'
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'

@Controller('reports')

export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('tasks')
  async downloadReport(
    
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
     @Query('type') type: string,
  @Query('entityId') entityId: string,
  @Query('duration') duration: string,
    @Res() res: Response,
  ) {
    return this.reportsService.generateTaskReport(
       duration,
  startDate,
  endDate,
  type,
  entityId,
  res
    )
  }
}