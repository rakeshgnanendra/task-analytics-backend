import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { CurrentUser } from './current-user.decorator'
import { Roles } from './roles.decorator'
import { GlobalRole } from '@prisma/client'
import { RolesGuard } from './roles.guard'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return user
  }

  // ✅ ADMIN TEST ROUTE (INSIDE CLASS)
  @UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.DELIVERY_HEAD)
@Get('admin-test')
adminTest() {
  return { message: 'You are Delivery Head' }
}
@UseGuards(JwtAuthGuard)
@Post('change-password')
async changePassword(
  @CurrentUser() user: any,
  @Body('currentPassword') currentPassword: string,
  @Body('newPassword') newPassword: string,
) {
  return this.authService.changePassword(
    user.userId,
    currentPassword,
    newPassword,
  )
}
}
