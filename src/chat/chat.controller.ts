import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ChatService } from './chat.service'

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'

@Controller('chat')
@UseGuards(JwtAuthGuard) // ✅ secure APIs
export class ChatController {
  constructor(private chatService: ChatService) {}

  // ✅ Mark chat as read

  @Post(':taskId/mark-read')
    @UseGuards(JwtAuthGuard)
  markChatRead(
    @Param('taskId') taskId: string,
    @Req() req,
  ) {
    return this.chatService.markAsRead(taskId, req.user?.userId)
  }

  // ✅ Get total unread count (floating bubble)
  
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  getUnreadCount(@Req() req) {
    return this.chatService.getUnreadCount(req.user.userId)
  }

  // ✅ Get unread per task (highlight rows)
  
  @Get('unread-per-task')
  @UseGuards(JwtAuthGuard)
  getUnreadPerTask(@Req() req) {
    return this.chatService.getUnreadPerTask(req.user.userId)
  }
}