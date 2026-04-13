import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

async createNotification(userId, type, message, taskId, referenceId) {
  return this.prisma.notification.create({
    data: {
      userId,
      type,
      message,
      taskId,
      referenceId,
    },
  });
}

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId: userId },
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
  async markAsRead(notificationId: string) {
  return this.prisma.notification.update({
    where: { id : notificationId},
    data: { isRead: true },
  });
}
}
