import {
  Controller,
  Post,
  Get,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createUser(
    @Body() dto: any,
    @Req() req: any,
  ) {
    return this.usersService.createUser(dto, req.user.role)
  }
  @UseGuards(JwtAuthGuard)
@Patch(':id/toggle-status')
async toggleUser(
  @Param('id') id: string,
  @Req() req: any,
) {
  return this.usersService.toggleUserStatus(id, req.user.role)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/exit')
async markExited(
  @Param('id') id: string,
  @Body('reason') reason: string,
  @Req() req: any,
) {
  return this.usersService.markUserExited(id, req.user.role, reason)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/reactivate')
async reactivateUser(
  @Param('id') id: string,
  @Req() req: any,
) {
  return this.usersService.reactivateUser(id, req.user.role)
}
@UseGuards(JwtAuthGuard)
@Get()
async getUsers(
  @Query() query: any,
  @Req() req: any,
) {
  return this.usersService.getUsers(query, req.user.role)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/role')
async updateRole(
  @Param('id') id: string,
  @Body('role') role: string,
  @Req() req: any,
) {
  return this.usersService.updateUserRole(
    id,
    role,
    req.user.role,
  )
}
}
