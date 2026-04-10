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

  const conditions = seenRecords.map(seen => ({
    taskId: seen.taskId,
    createdAt: {
      gt: seen.lastSeen || new Date(0),
    },
  }))

  const count = await this.prisma.taskComment.count({
    where: {
      userId: {
        not: userId,
      },
      OR: conditions.length > 0 ? conditions : undefined,
    },
  })

  return { count }
}

  // ✅ Get unread count per task (for UI highlight)
 async getUnreadPerTask(userId: string) {
  const tasks = await this.prisma.task.findMany({
    where: {
      // adjust based on role if needed
    },
    select: {
      id: true,
    },
  })

  const seenRecords = await this.prisma.taskChatSeen.findMany({
    where: { userId },
  })

  const seenMap = new Map()
  seenRecords.forEach(seen => {
    seenMap.set(seen.taskId, seen)
  })

  const result: any[] = []

  for (const task of tasks) {
    const lastSeen = seenMap.get(task.id)

    const count = await this.prisma.taskComment.count({
      where: {
        taskId: task.id, // ✅ STRICT FILTER

        userId: {
          not: userId, // ✅ ignore own messages
        },

        createdAt: {
          gt: lastSeen?.lastSeen || new Date(0), // ✅ per task
        },
      },
    })

    result.push({
      taskId: task.id,
      unreadCount: count,
    })
  }

  return result
}
}