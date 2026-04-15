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
  const notifications = await this.prisma.notification.findMany({
    where: {
      userId,
      isDeleted: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const groupedMap = new Map();

  for (const n of notifications) {
    const key = `${n.taskId}-${n.type}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        ...n,
        count: 1,
      });
    } else {
      const existing = groupedMap.get(key);
      existing.count += 1;

      // always keep latest notification
      if (new Date(n.createdAt) > new Date(existing.createdAt)) {
        groupedMap.set(key, {
          ...n,
          count: existing.count,
        });
      }
    }
  }

  return Array.from(groupedMap.values()).slice(0, 20);
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

  // 🔥 SAFETY CHECK
  if (!userId) {
    console.log("UserId missing in markAsRead");
    return { success: true };
  }

  // =========================
  // 🔥 1. GET NOTIFICATION
  // =========================

  const notification = await this.prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
      isDeleted: false,
    },
  });

  if (!notification) {
    return { message: "Notification already handled" };
  }

  // =========================
  // 🔥 2. MARK AS READ + DELETE
  // =========================

  await this.prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      isDeleted: true,
    },
  });

  // =========================
  // 🔥 3. UPDATE SEEN STATUS
  // =========================

  if (notification.referenceId) {
    const comment = await this.prisma.taskComment.findUnique({
      where: { id: notification.referenceId },
    });

    if (
      comment &&
      userId &&
      !comment.seenBy.includes(userId)
    ) {
      await this.prisma.taskComment.update({
        where: { id: notification.referenceId },
        data: {
          seenBy: {
            push: [userId], // ✅ FIXED
          },
        },
      });
    }
  }

  return { success: true };
}
}