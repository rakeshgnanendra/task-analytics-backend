import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

async createNotification(
  userId: string,
  type: string,
  message: string,
  taskId?: string,
  referenceId?: string
) {
  console.log("REF ID:", referenceId); // 🔥 ADD THIS

  return this.prisma.notification.create({
    data: {
      userId,
      type,
      message,
      taskId,
      referenceId, // must NOT be null
    },
  });
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
