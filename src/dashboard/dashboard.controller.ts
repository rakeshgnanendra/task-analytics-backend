import { Controller, Get, UseGuards } from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: any) {
    return this.dashboardService.getDashboardData(
      user.userId,
      user.role,
    )
  }
  @Get("/team-workload")
getTeamWorkload(@CurrentUser() user: any) {
  return this.dashboardService.getTeamWorkload(user.userId);
}
@Get("/upcoming-deadlines")
getUpcomingDeadlines(@CurrentUser() user: any) {
  return this.dashboardService.getUpcomingDeadlines(user.userId)
}
}
