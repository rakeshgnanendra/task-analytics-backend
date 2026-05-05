import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'
import { KpiService } from './kpi.service'

@Controller('kpi')
@UseGuards(JwtAuthGuard)
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Get('financial-year/current')
  getCurrentFinancialYear() {
    return this.kpiService.getCurrentFinancialYear()
  }

  @Post('cycles')
  createCycle(@Body() body: any, @Req() req: any) {
    return this.kpiService.createCycle(body, req.user)
  }

  @Get('cycles')
  getCycles() {
    return this.kpiService.getCycles()
  }

  @Patch('cycles/:id')
  updateCycle(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.kpiService.updateCycle(id, body, req.user)
  }

  @Post('templates')
  createTemplate(@Body() body: any, @Req() req: any) {
    return this.kpiService.createTemplate(body, req.user)
  }

  @Get('templates')
  getTemplates(@Query() query: any) {
    return this.kpiService.getTemplates(query)
  }

  @Post('assignments')
  assignTemplate(@Body() body: any, @Req() req: any) {
    return this.kpiService.assignTemplate(body, req.user)
  }

  @Get('assignments')
  getAssignments(@Query() query: any, @Req() req: any) {
    return this.kpiService.getAssignments(query, req.user)
  }

  @Get('assignments/:id')
  getAssignment(@Param('id') id: string, @Req() req: any) {
    return this.kpiService.getAssignment(id, req.user)
  }

  @Post('assignments/:id/recalculate')
  recalculateAssignment(@Param('id') id: string, @Req() req: any) {
    return this.kpiService.recalculateAssignment(id, req.user)
  }

  @Post('assignments/:id/feedback')
  addFeedback(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.kpiService.addFeedback(id, body, req.user)
  }
}
