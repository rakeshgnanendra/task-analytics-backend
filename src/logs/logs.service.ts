import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async createLog(
    action: string,
    entityType: string,
    entityId: string,
    performedBy: string,
    metadata?: any,
  ) {
    return this.prisma.activityLog.create({
      data: {
        action,
        entityType,
        entityId,
        performedBy,
        metadata,
      },
    })
  }

  async getLogs(query: any) {
    const where: any = {}

    if (query.entityType) where.entityType = query.entityType
    if (query.entityId) where.entityId = query.entityId
    if (query.performedBy) where.performedBy = query.performedBy

    return this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })
  }
}