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
        isRead: false,
        isDeleted: false,
      },
    });
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        isDeleted: false, // ✅ correct
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isDeleted: false, // ✅ FIXED
      },
      data: {
        isRead: true,
        isDeleted: true,
      },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
        isDeleted: false,
      },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,           // 🔐 IMPORTANT
        isDeleted: false, // 🚫 prevents crash
      },
      data: {
        isRead: true,
        isDeleted: true,
      },
    });
  }
}