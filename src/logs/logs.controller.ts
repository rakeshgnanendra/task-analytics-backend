import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { LogsService } from './logs.service'
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'

@Controller('logs')
@UseGuards(JwtAuthGuard)
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get()
  async getLogs(@Query() query: any) {
    return this.logsService.getLogs(query)
  }
}