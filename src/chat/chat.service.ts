import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ✅ Mark chat as read
  async markAsRead(taskId: string, userId: string) {
    return this.prisma.taskChatSeen.upsert({
      where: {
        userId_taskId: {
          userId,
          taskId,
        },
      },
      update: {
        lastSeen: new Date(),
      },
      create: {
        userId,
        taskId,
        lastSeen: new Date(),
      },
    })
  }

  // ✅ Get total unread count (for floating bubble)
  async getUnreadCount(userId: string) {
    const seenRecords = await this.prisma.taskChatSeen.findMany({
      where: { userId },
    })

    let total = 0

    for (const seen of seenRecords) {
      const count = await this.prisma.taskComment.count({
        where: {
          taskId: seen.taskId,
          createdAt: {
            gt: seen.lastSeen,
          },
        },
      })

      total += count
    }

    return { count: total }
  }

  // ✅ Get unread count per task (for UI highlight)
  async getUnreadPerTask(userId: string) {
  const tasks = await this.prisma.task.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        { createdById: userId },
      ],
    },
    select: { id: true },
  })

  const taskIds = tasks.map(t => t.id)

  const seenRecords = await this.prisma.taskChatSeen.findMany({
    where: { userId },
  })

  const seenMap = new Map(
    seenRecords.map(s => [s.taskId, s.lastSeen])
  )

  // 🔥 get all comments in one go
  const comments = await this.prisma.taskComment.findMany({
    where: {
      taskId: { in: taskIds },
      userId: { not: userId },
    },
    select: {
      taskId: true,
      createdAt: true,
    },
  })

  const result: { taskId: string; unreadCount: number }[] = []

  for (const task of tasks) {
    const lastSeen = seenMap.get(task.id)

    const count = comments.filter(c => {
      if (!lastSeen) return true
      return c.taskId === task.id && c.createdAt > lastSeen
    }).length

    result.push({
      taskId: task.id,
      unreadCount: count,
    })
  }

  return result
}
}