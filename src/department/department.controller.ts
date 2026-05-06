import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common'
import { DepartmentService } from './department.service'
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'

@Controller('departments')
export class DepartmentController {
  constructor(private service: DepartmentService) {}

  private checkAdmin(role: string) {
    if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admin allowed')
    }
  }

  private checkDepartmentManager(role: string) {
    if (!['SUPER_ADMIN', 'DELIVERY_HEAD'].includes(role)) {
      throw new ForbiddenException('Only Super Admin or Delivery Head allowed')
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body('name') name: string, @Req() req) {
    this.checkAdmin(req.user.role)
    return this.service.create(name)
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll() {
    return this.service.findAll()
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body('name') name: string, @Req() req) {
    this.checkAdmin(req.user.role)
    return this.service.update(id, name)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    this.checkAdmin(req.user.role)
    return this.service.delete(id)
  }
    @UseGuards(JwtAuthGuard)
  @Get(':id/tasks')
getDepartmentTasks(@Param('id') id: string) {
  return this.service.getDepartmentTasks(id);
}
@UseGuards(JwtAuthGuard)
@Get(':id/dashboard')
getDepartmentDashboard(@Param('id') id: string) {
  return this.service.getDepartmentDashboard(id);
}
@UseGuards(JwtAuthGuard)
@Patch(':id/assign-user')
assignUser(
  @Param('id') departmentId: string,
  @Body('userId') userId: string,
) {
  return this.service.assignUser(departmentId, userId)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/users/:userId/lead-status')
setLeadStatus(
  @Param('id') departmentId: string,
  @Param('userId') userId: string,
  @Body('isDepartmentLead') isDepartmentLead: boolean,
  @Req() req,
) {
  this.checkDepartmentManager(req.user.role)
  return this.service.setLeadStatus(departmentId, userId, isDepartmentLead)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/users/:userId/team-lead')
assignTeamLead(
  @Param('id') departmentId: string,
  @Param('userId') userId: string,
  @Body('leadId') leadId: string | null,
  @Req() req,
) {
  this.checkDepartmentManager(req.user.role)
  return this.service.assignTeamLead(departmentId, userId, leadId || null)
}
@UseGuards(JwtAuthGuard)
@Get(':id/users')
getDepartmentUsers(@Param('id') id: string) {
  return this.service.getUsers(id)
}
}
