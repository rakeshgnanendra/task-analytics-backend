import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private async getVisibleTaskIds(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        projectLinks: {
          select: { projectId: true },
        },
        deliveryHeadProjects: {
          select: { id: true },
        },
      },
    })

    if (!user) return []

    const projectIds = [
      ...user.projectLinks.map((project) => project.projectId),
      ...user.deliveryHeadProjects.map((project) => project.id),
    ]

    const tasks = await this.prisma.task.findMany({
      where: {
        isDeleted: false,
        OR: [
          { assignedToId: userId },
          { createdById: userId },
          { projectId: { in: projectIds } },
          ...(user.role === 'DELIVERY_HEAD'
            ? [{ departmentId: user.departmentId }]
            : []),
        ],
      },
      select: { id: true },
    })

    return tasks.map((task) => task.id)
  }

  private async ensureCanReadTask(taskId: string, userId: string) {
    const visibleTaskIds = await this.getVisibleTaskIds(userId)

    if (!visibleTaskIds.includes(taskId)) {
      throw new ForbiddenException('You do not have access to this task chat')
    }
  }

  async markAsRead(taskId: string, userId: string) {
    await this.ensureCanReadTask(taskId, userId)

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

  async getUnreadCount(userId: string) {
    const taskIds = await this.getVisibleTaskIds(userId)
    if (taskIds.length === 0) return { count: 0 }

    const seenRecords = await this.prisma.taskChatSeen.findMany({
      where: { userId },
    })

    const seenMap = new Map()
    seenRecords.forEach((seen) => {
      seenMap.set(seen.taskId, seen)
    })

    let count = 0

    for (const taskId of taskIds) {
      const lastSeen = seenMap.get(taskId)

      count += await this.prisma.taskComment.count({
        where: {
          taskId,
          userId: {
            not: userId,
          },
          createdAt: {
            gt: lastSeen?.lastSeen || new Date(0),
          },
        },
      })
    }

    return { count }
  }

  async getUnreadPerTask(userId: string) {
    const taskIds = await this.getVisibleTaskIds(userId)

    const seenRecords = await this.prisma.taskChatSeen.findMany({
      where: { userId },
    })

    const seenMap = new Map()
    seenRecords.forEach((seen) => {
      seenMap.set(seen.taskId, seen)
    })

    const result: any[] = []

    for (const taskId of taskIds) {
      const lastSeen = seenMap.get(taskId)

      const count = await this.prisma.taskComment.count({
        where: {
          taskId,
          userId: {
            not: userId,
          },
          createdAt: {
            gt: lastSeen?.lastSeen || new Date(0),
          },
        },
      })

      result.push({
        taskId,
        unreadCount: count,
      })
    }

    return result
  }
}
