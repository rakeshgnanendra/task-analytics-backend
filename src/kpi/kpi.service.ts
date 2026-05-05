import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  GlobalRole,
  KpiAssignmentStatus,
  KpiCycleStatus,
  KpiReviewPhase,
  TaskStatus,
} from '@prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class KpiService {
  constructor(private prisma: PrismaService) {}

  private canManageKpi(user: any) {
    return ['SUPER_ADMIN', 'DELIVERY_HEAD', 'HR'].includes(user.role)
  }

  private toIstEndOfDay(date: Date) {
    const dueDate = new Date(date)
    dueDate.setUTCHours(18, 29, 59, 999)
    return dueDate
  }

  private assertCanManageKpi(user: any) {
    if (!this.canManageKpi(user)) {
      throw new ForbiddenException('You cannot manage KPI records')
    }
  }

  getCurrentFinancialYear(date = new Date()) {
    const month = date.getMonth()
    const year = date.getFullYear()
    const startYear = month >= 8 ? year : year - 1
    const endYear = startYear + 1

    return {
      financialYear: `FY ${startYear}-${String(endYear).slice(-2)}`,
      startDate: new Date(startYear, 8, 1),
      endDate: new Date(endYear, 7, 31, 23, 59, 59, 999),
    }
  }

  async createCycle(body: any, user: any) {
    this.assertCanManageKpi(user)

    const fy = body.financialYear
      ? {
          financialYear: body.financialYear,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
        }
      : this.getCurrentFinancialYear()

    return this.prisma.kpiCycle.create({
      data: {
        name: body.name || fy.financialYear,
        financialYear: fy.financialYear,
        startDate: fy.startDate,
        endDate: fy.endDate,
        managerReviewStart: body.managerReviewStart
          ? new Date(body.managerReviewStart)
          : null,
        managerReviewEnd: body.managerReviewEnd
          ? new Date(body.managerReviewEnd)
          : null,
        status: body.status || KpiCycleStatus.DRAFT,
        releaseToEmployees: Boolean(body.releaseToEmployees),
      },
    })
  }

  getCycles() {
    return this.prisma.kpiCycle.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: { assignments: true },
        },
      },
    })
  }

  async updateCycle(id: string, body: any, user: any) {
    this.assertCanManageKpi(user)

    return this.prisma.kpiCycle.update({
      where: { id },
      data: {
        name: body.name,
        status: body.status,
        releaseToEmployees: body.releaseToEmployees,
        managerReviewStart: body.managerReviewStart
          ? new Date(body.managerReviewStart)
          : undefined,
        managerReviewEnd: body.managerReviewEnd
          ? new Date(body.managerReviewEnd)
          : undefined,
      },
    })
  }

  async createTemplate(body: any, user: any) {
    this.assertCanManageKpi(user)

    const items = body.items || []
    const totalWeight = items.reduce(
      (sum: number, item: any) => sum + Number(item.weight || 0),
      0,
    )

    if (!items.length) {
      throw new BadRequestException('At least one KPI item is required')
    }

    if (Math.round(totalWeight) !== 100) {
      throw new BadRequestException('KPI template weights must total 100')
    }

    return this.prisma.kpiTemplate.create({
      data: {
        name: body.name,
        role: body.role as GlobalRole,
        designation: body.designation || null,
        departmentId: body.departmentId || null,
        createdById: user.userId || user.id,
        items: {
          create: items.map((item: any, index: number) => ({
            category: item.category,
            goal: item.goal,
            measure: item.measure || null,
            weight: Number(item.weight),
            taskLinked: item.taskLinked !== false,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: { items: true, department: true },
    })
  }

  getTemplates(query: any) {
    return this.prisma.kpiTemplate.findMany({
      where: {
        isActive: true,
        role: query.role || undefined,
        designation: query.designation || undefined,
        departmentId: query.departmentId || undefined,
      },
      include: {
        department: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async assignTemplate(body: any, user: any) {
    this.assertCanManageKpi(user)

    const existingAssignment = await this.prisma.kpiAssignment.findUnique({
      where: {
        cycleId_employeeId: {
          cycleId: body.cycleId,
          employeeId: body.employeeId,
        },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        cycle: true,
      },
    })

    if (existingAssignment) {
      throw new BadRequestException(
        `${existingAssignment.employee.firstName} ${existingAssignment.employee.lastName} already has KPI assigned for ${existingAssignment.cycle.financialYear}`,
      )
    }

    const template = await this.prisma.kpiTemplate.findUnique({
      where: { id: body.templateId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!template) throw new NotFoundException('KPI template not found')

    const assignment = await this.prisma.kpiAssignment.create({
      data: {
        cycleId: body.cycleId,
        employeeId: body.employeeId,
        managerId: body.managerId || null,
        templateId: body.templateId,
        status: KpiAssignmentStatus.ASSIGNED,
        items: {
          create: template.items.map((item) => ({
            templateItemId: item.id,
            category: item.category,
            goal: item.goal,
            measure: item.measure,
            weight: item.weight,
            taskLinked: item.taskLinked,
          })),
        },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        cycle: true,
        items: true,
      },
    })

    return this.recalculateAssignment(assignment.id, user)
  }

  async getAssignments(query: any, user: any) {
    const where: any = {}

    if (query.cycleId) where.cycleId = query.cycleId
    if (query.employeeId) where.employeeId = query.employeeId
    if (query.managerId) where.managerId = query.managerId

    if (!this.canManageKpi(user)) {
      where.OR = [{ employeeId: user.userId }, { managerId: user.userId }]
    }

    return this.prisma.kpiAssignment.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            designation: true,
            department: true,
          },
        },
        manager: { select: { id: true, firstName: true, lastName: true } },
        cycle: true,
        template: true,
        items: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async getAssignment(id: string, user: any) {
    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            designation: true,
            department: true,
          },
        },
        manager: { select: { id: true, firstName: true, lastName: true } },
        cycle: true,
        items: {
          include: {
            tasks: {
              select: {
                id: true,
                ticketId: true,
                title: true,
                status: true,
                dueDate: true,
                completedAt: true,
                confirmedAt: true,
                kpiWeight: true,
              },
            },
          },
        },
        feedbacks: {
          include: {
            reviewer: { select: { firstName: true, lastName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    const isAllowed =
      this.canManageKpi(user) ||
      assignment.employeeId === user.userId ||
      assignment.managerId === user.userId

    if (!isAllowed) throw new ForbiddenException('You cannot view this KPI')

    return assignment
  }

  private scoreItem(tasks: any[], weight: number) {
    const linkedTasks = tasks.filter((task) => task.isKpiLinked)
    const confirmedTasks = linkedTasks.filter(
      (task) => task.status === TaskStatus.CONFIRMED,
    )
    const rejectedTasks = linkedTasks.filter(
      (task) => task.status === TaskStatus.REJECTED,
    )

    if (linkedTasks.length === 0) {
      return {
        completionScore: 0,
        onTimeScore: 0,
        qualityScore: 0,
        productivityScore: 0,
        currentScore: 0,
      }
    }

    const onTimeConfirmed = confirmedTasks.filter((task) => {
      const doneAt = task.confirmedAt || task.completedAt
      return doneAt && new Date(doneAt) <= this.toIstEndOfDay(task.dueDate)
    })

    const completionRate = confirmedTasks.length / linkedTasks.length
    const onTimeRate = confirmedTasks.length
      ? onTimeConfirmed.length / confirmedTasks.length
      : 0
    const qualityRate = Math.max(
      0,
      1 - rejectedTasks.length / linkedTasks.length,
    )
    const productivityRate = Math.min(
      1,
      linkedTasks.reduce(
        (sum, task) => sum + Number(task.kpiWeight || 1),
        0,
      ) / linkedTasks.length / 3,
    )

    const completionScore = weight * 0.35 * completionRate
    const onTimeScore = weight * 0.25 * onTimeRate
    const qualityScore = weight * 0.25 * qualityRate
    const productivityScore = weight * 0.15 * productivityRate
    const currentScore =
      completionScore + onTimeScore + qualityScore + productivityScore

    return {
      completionScore,
      onTimeScore,
      qualityScore,
      productivityScore,
      currentScore,
    }
  }

  async recalculateAssignment(id: string, user: any) {
    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id },
      include: { items: true, cycle: true },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    const canRecalculate =
      this.canManageKpi(user) ||
      assignment.employeeId === user.userId ||
      assignment.managerId === user.userId

    if (!canRecalculate) {
      throw new ForbiddenException('You cannot recalculate this KPI')
    }

    let autoScore = 0

    for (const item of assignment.items) {
      const tasks = await this.prisma.task.findMany({
        where: {
          assignedToId: assignment.employeeId,
          isDeleted: false,
          isKpiLinked: true,
          kpiAssignmentItemId: item.id,
          createdAt: {
            gte: assignment.cycle.startDate,
            lte: assignment.cycle.endDate,
          },
        },
      })

      const score = this.scoreItem(tasks, item.weight)
      autoScore += score.currentScore

      await this.prisma.kpiAssignmentItem.update({
        where: { id: item.id },
        data: score,
      })
    }

    return this.prisma.kpiAssignment.update({
      where: { id },
      data: {
        autoScore,
        finalScore: Math.max(
          0,
          Math.min(100, autoScore + assignment.managerAdjustment),
        ),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        manager: { select: { firstName: true, lastName: true } },
        cycle: true,
        items: true,
      },
    })
  }

  async addFeedback(id: string, body: any, user: any) {
    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id },
      include: { cycle: true },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    const isReviewer =
      this.canManageKpi(user) || assignment.managerId === user.userId

    if (!isReviewer) {
      throw new ForbiddenException('Only HR/DH/manager can add KPI feedback')
    }

    const now = new Date()
    const reviewOpen =
      assignment.cycle.managerReviewStart &&
      assignment.cycle.managerReviewEnd &&
      now >= assignment.cycle.managerReviewStart &&
      now <= assignment.cycle.managerReviewEnd

    if (!reviewOpen && !this.canManageKpi(user)) {
      throw new ForbiddenException('KPI review window is closed')
    }

    const adjustment = Number(body.adjustment || 0)

    await this.prisma.kpiFeedback.create({
      data: {
        assignmentId: id,
        reviewerId: user.userId,
        phase: (body.phase || KpiReviewPhase.FINAL) as KpiReviewPhase,
        rating: body.rating || null,
        comment: body.comment,
        adjustment,
      },
    })

    await this.prisma.kpiAssignment.update({
      where: { id },
      data: {
        managerAdjustment: adjustment,
        managerFinalComments: body.comment,
        status: KpiAssignmentStatus.REVIEWED,
      },
    })

    return this.recalculateAssignment(id, user)
  }
}
