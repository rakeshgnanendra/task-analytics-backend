import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  getNotifications(@Req() req) {
    return this.notificationService.getUserNotifications(req.user.id)
  }

  @Get('unread-count')
  getUnread(@Req() req) {
    return this.notificationService.getUnreadCount(req.user.id)
  }

  @Patch('read-all')
  markAll(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.id)
  }
  @Patch(':id/read')
markAsRead(@Param('id') id: string) {
  return this.notificationService.markAsRead(id);
}
}
