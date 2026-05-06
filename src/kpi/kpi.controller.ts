import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
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

  @Get('cycles/:id/summary/pdf')
  getKpiCycleSummaryPdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    return this.kpiService.generateKpiCycleSummaryPdf(id, req.user, res)
  }

  @Post('templates')
  createTemplate(@Body() body: any, @Req() req: any) {
    return this.kpiService.createTemplate(body, req.user)
  }

  @Get('templates')
  getTemplates(@Query() query: any) {
    return this.kpiService.getTemplates(query)
  }

  @Get('people')
  getKpiPeople(@Req() req: any) {
    return this.kpiService.getKpiPeople(req.user)
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

  @Get('assignments/:id/report')
  getKpiReport(@Param('id') id: string, @Req() req: any) {
    return this.kpiService.getKpiReport(id, req.user)
  }

  @Get('assignments/:id/report/pdf')
  getKpiPdfReport(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    return this.kpiService.generateKpiPdfReport(id, req.user, res)
  }

  @Post('assignments/:id/acknowledge')
  acknowledgeAssignment(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.kpiService.acknowledgeAssignment(id, body, req.user)
  }

  @Post('assignments/:id/finalize')
  finalizeAssignment(@Param('id') id: string, @Req() req: any) {
    return this.kpiService.finalizeAssignment(id, req.user)
  }

  @Patch('assignments/:id/items/:itemId/review')
  reviewAssignmentItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.kpiService.reviewAssignmentItem(id, itemId, body, req.user)
  }

  @Post('assignments/:id/feedback')
  addFeedback(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.kpiService.addFeedback(id, body, req.user)
  }
}
