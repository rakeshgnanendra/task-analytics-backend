import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Patch,
  Delete,
  Param,
} from '@nestjs/common'
import { ProjectService } from './project.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { GlobalRole, ProjectRole } from '@prisma/client'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('projects')
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  // ✅ CREATE PROJECT
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GlobalRole.DELIVERY_HEAD)
  @Post()
async createProject(
  @Body('name') name: string,
  @Body('description') description: string,
  @CurrentUser() user: any,
) {
  return this.projectService.createProject(
    name,
    description,
    user.userId,
    user.role,
  )
}
 @UseGuards(JwtAuthGuard)
@Get('/dashboard/overdue-tasks')
async getOverdueTasks() {
  return this.projectService.getOverdueTasks();
}
@Get('/dashboard/pending-confirmation')
getPendingConfirmationTasks() {
  return this.projectService.getPendingConfirmationTasks();
}
@Get('/dashboard/high-risk')
getHighRiskProjects() {
  return this.projectService.getHighRiskProjects();
}
@UseGuards(JwtAuthGuard)
@Get('team')
getTeam(@CurrentUser() user: any) {
  return this.projectService.getTeam(user.userId);
}
  // ✅ GET SINGLE PROJECT
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getProjectById(@Param('id') id: string) {
    return this.projectService.getProjectById(id)
  }
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.DELIVERY_HEAD)
@Patch(':id/toggle-status')
async toggleProjectStatus(
  @Param('id') id: string,
  @CurrentUser() user: any,
) {
  return this.projectService.toggleProjectStatus(
    id,
    user.role,
  )
}
  // ✅ GET ALL PROJECTS (visibility logic inside service)
  @UseGuards(JwtAuthGuard)
  @Get()
  async getProjects(@CurrentUser() user: any) {
    return this.projectService.getProjects(user.userId, user.role)
  }

  // ✅ ADD MEMBER
 @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.DELIVERY_HEAD, GlobalRole.SUPER_ADMIN)
@Post(':id/members')
async addMember(
  @Param('id') projectId: string,
  @Body('userId') userId: string,
  @Body('role') role: ProjectRole,
  @CurrentUser() user: any,
) {
  return this.projectService.addProjectMember(
    projectId,
    userId,
    role,
    user.role,
  )
}

  // ✅ REMOVE MEMBER
  @UseGuards(JwtAuthGuard, RolesGuard)

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
      @CurrentUser() user: any,
  ) {
    return this.projectService.removeProjectMember(
      projectId,
      userId,
      user.role
    )
  }

  // ✅ UPDATE PROJECT
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateProject(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.projectService.updateProject(
      id,
      user.userId,
      user.role,
      body,
    )
  }

  // ✅ DELETE PROJECT
  @UseGuards(JwtAuthGuard,RolesGuard)
  @Roles(GlobalRole.DELIVERY_HEAD)
  @Delete(':id')
  async deleteProject(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.projectService.deleteProject(id, user.role)
  }
 
}