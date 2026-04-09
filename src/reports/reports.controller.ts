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
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('tasks')
  async downloadReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId: string,
    @Res() res: Response,
  ) {
    return this.reportsService.generateTaskReport(
      startDate,
      endDate,
      userId,
      res,
    )
  }
}