import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async createNotification(userId, type, message, taskId) {
  // prevent duplicate within 2 seconds
  const recent = await this.prisma.notification.findFirst({
    where: {
      userId,
      taskId,
      type,
      createdAt: {
        gte: new Date(Date.now() - 2000),
      },
    },
  })

  if (recent) return

  return this.prisma.notification.create({
    data: {
      userId,
      type,
      message,
      taskId,
    },
  })
}

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    })
  }
}
