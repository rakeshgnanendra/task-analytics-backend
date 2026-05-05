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
import type { Response } from 'express'
import PDFDocument from 'pdfkit'
import * as path from 'path'

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

  private isReviewWindowOpen(cycle: any) {
    const now = new Date()

    return (
      cycle.managerReviewStart &&
      cycle.managerReviewEnd &&
      now >= cycle.managerReviewStart &&
      now <= cycle.managerReviewEnd
    )
  }

  private isManagerOnlyKpiCategory(category?: string | null) {
    return ['code quality', 'documentation'].includes(
      String(category || '').trim().toLowerCase(),
    )
  }

  private isTaskLinkedKpiItem(item: any) {
    return item.taskLinked && !this.isManagerOnlyKpiCategory(item.category)
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
    const name = String(body.name || '').trim()
    const designation = String(body.designation || '').trim() || null
    const departmentId = body.departmentId || null
    const totalWeight = items.reduce(
      (sum: number, item: any) => sum + Number(item.weight || 0),
      0,
    )

    if (!name) {
      throw new BadRequestException('KPI template name is required')
    }

    if (!items.length) {
      throw new BadRequestException('At least one KPI item is required')
    }

    if (Math.round(totalWeight) !== 100) {
      throw new BadRequestException('KPI template weights must total 100')
    }

    const existingTemplate = await this.prisma.kpiTemplate.findFirst({
      where: {
        name,
        role: body.role as GlobalRole,
        designation,
        departmentId,
      },
      include: { items: true, department: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (existingTemplate) {
      await this.prisma.kpiTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          isActive: true,
          createdById: existingTemplate.createdById || user.userId || user.id,
        },
      })

      for (const [index, item] of items.entries()) {
        const existingItem = existingTemplate.items.find(
          (templateItem) =>
            templateItem.category.trim().toLowerCase() ===
            String(item.category || '').trim().toLowerCase(),
        )

        if (existingItem) {
          await this.prisma.kpiTemplateItem.update({
            where: { id: existingItem.id },
            data: {
              goal: item.goal,
              measure: item.measure || null,
              weight: Number(item.weight),
              taskLinked: item.taskLinked !== false,
              sortOrder: item.sortOrder ?? index,
            },
          })
        } else {
          await this.prisma.kpiTemplateItem.create({
            data: {
              templateId: existingTemplate.id,
              category: item.category,
              goal: item.goal,
              measure: item.measure || null,
              weight: Number(item.weight),
              taskLinked: item.taskLinked !== false,
              sortOrder: item.sortOrder ?? index,
            },
          })
        }
      }

      return this.prisma.kpiTemplate.findUnique({
        where: { id: existingTemplate.id },
        include: {
          department: true,
          items: { orderBy: { sortOrder: 'asc' } },
        },
      })
    }

    return this.prisma.kpiTemplate.create({
      data: {
        name,
        role: body.role as GlobalRole,
        designation,
        departmentId,
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

  async getTemplates(query: any) {
    const templates = await this.prisma.kpiTemplate.findMany({
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
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    const seen = new Set<string>()

    return templates.filter((template) => {
      const key = [
        template.name.trim().toLowerCase(),
        template.role || '',
        template.designation || '',
        template.departmentId || '',
      ].join('|')

      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async getKpiPeople(user: any) {
    this.assertCanManageKpi(user)

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: [GlobalRole.EMPLOYEE, GlobalRole.HR, GlobalRole.DELIVERY_HEAD],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        designation: true,
        department: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    return { data: users }
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

  private async getAuthorizedAssignment(id: string, user: any) {
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
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        cycle: true,
        items: {
          orderBy: { category: 'asc' },
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

  async getKpiReport(id: string, user: any) {
    const assignment = await this.getAuthorizedAssignment(id, user)
    const latestFinalFeedback = assignment.feedbacks.find(
      (feedback) => feedback.phase === KpiReviewPhase.FINAL,
    )

    return {
      assignment,
      summary: {
        employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
        managerName: assignment.manager
          ? `${assignment.manager.firstName} ${assignment.manager.lastName}`
          : '-',
        financialYear: assignment.cycle.financialYear,
        reviewStatus: assignment.status,
        autoScore: assignment.autoScore,
        finalScore: assignment.finalScore,
        rating: latestFinalFeedback?.rating || '-',
        managerFinalComments: assignment.managerFinalComments || '',
        employeeAcknowledgedAt: assignment.employeeAcknowledgedAt,
        employeeAcknowledgementComment:
          assignment.employeeAcknowledgementComment || '',
      },
    }
  }

  async acknowledgeAssignment(id: string, body: any, user: any) {
    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    if (assignment.employeeId !== user.userId) {
      throw new ForbiddenException('Only the employee can acknowledge this KPI')
    }

    if (assignment.status !== KpiAssignmentStatus.REVIEWED) {
      throw new BadRequestException('KPI can be acknowledged after manager review')
    }

    if (assignment.employeeAcknowledgedAt) {
      throw new BadRequestException('KPI is already acknowledged')
    }

    return this.prisma.kpiAssignment.update({
      where: { id },
      data: {
        status: KpiAssignmentStatus.ACKNOWLEDGED,
        employeeAcknowledgedAt: new Date(),
        employeeAcknowledgementComment:
          String(body.comment || '').trim() || null,
        employeeComments: String(body.comment || '').trim() || null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        manager: { select: { firstName: true, lastName: true } },
        cycle: true,
        items: true,
      },
    })
  }

  async finalizeAssignment(id: string, user: any) {
    this.assertCanManageKpi(user)

    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    if (assignment.status === KpiAssignmentStatus.FINALIZED) {
      return assignment
    }

    if (
      assignment.status !== KpiAssignmentStatus.ACKNOWLEDGED ||
      !assignment.employeeAcknowledgedAt
    ) {
      throw new BadRequestException(
        'KPI can be finalized after employee acknowledgement',
      )
    }

    return this.prisma.kpiAssignment.update({
      where: { id },
      data: {
        status: KpiAssignmentStatus.FINALIZED,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        manager: { select: { firstName: true, lastName: true } },
        cycle: true,
        items: true,
      },
    })
  }

  async generateKpiPdfReport(id: string, user: any, res: Response) {
    const { assignment, summary } = await this.getKpiReport(id, user)
    const doc = new PDFDocument({ margin: 40 })
    const today = new Date().toISOString().split('T')[0]
    const fileName = `KPI_${summary.employeeName.replace(/\s+/g, '_')}_${summary.financialYear.replace(/\s+/g, '_')}_${today}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
    doc.pipe(res)

    const logoPath = path.join(process.cwd(), 'public', 'DP_logo.png')

    doc.font('Helvetica-Bold').fontSize(12).text('DIGITAL PERSONAS PVT LTD')
    doc.text('KPI Performance Report')
    try {
      doc.image(logoPath, 450, 40, { width: 100 })
    } catch {
      // Logo is optional in local/dev environments.
    }

    doc.moveDown()
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke()
    doc.moveDown()

    doc.font('Helvetica-Bold').fontSize(16).text(summary.employeeName, {
      align: 'center',
    })
    doc.font('Helvetica').fontSize(10).text(summary.financialYear, {
      align: 'center',
    })
    doc.moveDown(1.5)

    const info = [
      ['Employee', summary.employeeName],
      ['Designation', assignment.employee.designation || assignment.employee.role],
      ['Department', assignment.employee.department?.name || '-'],
      ['Manager', summary.managerName],
      ['Status', summary.reviewStatus],
      ['Rating', summary.rating],
      ['Auto Score', String(Math.round(summary.autoScore || 0))],
      ['Final Score', String(Math.round(summary.finalScore || 0))],
    ]

    doc.font('Helvetica-Bold').fontSize(12).text('Summary')
    doc.font('Helvetica').fontSize(10)
    info.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`)
    })

    doc.moveDown()
    doc.font('Helvetica-Bold').fontSize(12).text('KPI Breakdown')
    doc.moveDown(0.5)

    const col0 = 40
    const col1 = 200
    const col2 = 260
    const col3 = 330
    const col4 = 410
    let y = doc.y
    const rowHeight = 36
    const bottomMargin = 60

    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(9)
      doc.rect(col0, y, 160, 22).stroke()
      doc.text('Category', col0 + 5, y + 7, { width: 150, lineBreak: false })
      doc.rect(col1, y, 60, 22).stroke()
      doc.text('Weight', col1 + 5, y + 7)
      doc.rect(col2, y, 70, 22).stroke()
      doc.text('Score', col2 + 5, y + 7)
      doc.rect(col3, y, 80, 22).stroke()
      doc.text('Tasks', col3 + 5, y + 7)
      doc.rect(col4, y, 140, 22).stroke()
      doc.text('Comment', col4 + 5, y + 7)
      y += 22
      doc.font('Helvetica').fontSize(8)
    }

    drawHeader()

    const trim = (text: string, max = 45) =>
      text && text.length > max ? `${text.substring(0, max)}...` : text || '-'

    assignment.items.forEach((item, index) => {
      if (y + rowHeight > doc.page.height - bottomMargin) {
        doc.addPage()
        y = 60
        drawHeader()
      }

      if (index % 2 === 0) {
        doc.rect(col0, y, 510, rowHeight).fill('#f6f7fb')
        doc.fillColor('black')
      }

      doc.rect(col0, y, 160, rowHeight).stroke()
      doc.text(trim(item.category, 28), col0 + 5, y + 8, {
        width: 150,
        lineBreak: false,
      })
      doc.rect(col1, y, 60, rowHeight).stroke()
      doc.text(`${item.weight}%`, col1 + 5, y + 8)
      doc.rect(col2, y, 70, rowHeight).stroke()
      doc.text(`${Math.round(item.currentScore || 0)}`, col2 + 5, y + 8)
      doc.rect(col3, y, 80, rowHeight).stroke()
      doc.text(`${item.tasks?.length || 0}`, col3 + 5, y + 8)
      doc.rect(col4, y, 140, rowHeight).stroke()
      doc.text(trim(item.managerComments || '-', 35), col4 + 5, y + 8, {
        width: 130,
        lineBreak: false,
      })

      y += rowHeight
    })

    doc.y = y + 16
    doc.font('Helvetica-Bold').fontSize(12).text('Manager Feedback')
    doc.font('Helvetica').fontSize(10).text(summary.managerFinalComments || '-')
    doc.moveDown()
    doc.font('Helvetica-Bold').fontSize(12).text('Employee Acknowledgement')
    doc.font('Helvetica').fontSize(10)
    doc.text(
      summary.employeeAcknowledgedAt
        ? `Acknowledged on ${new Date(
            summary.employeeAcknowledgedAt,
          ).toLocaleDateString('en-IN')}`
        : 'Pending acknowledgement',
    )
    doc.text(summary.employeeAcknowledgementComment || '-')

    doc.moveDown(2)
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor('gray')
      .text('Generated by Task Analytics System', 0, doc.y, {
        align: 'center',
      })

    doc.end()
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

      const score = this.isTaskLinkedKpiItem(item)
        ? this.scoreItem(tasks, item.weight)
        : {
            completionScore: 0,
            onTimeScore: 0,
            qualityScore: 0,
            productivityScore: 0,
            currentScore: Math.max(
              0,
              Math.min(Number(item.weight || 0), Number(item.managerScore || 0)),
            ),
          }
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

  async reviewAssignmentItem(
    assignmentId: string,
    itemId: string,
    body: any,
    user: any,
  ) {
    const assignment = await this.prisma.kpiAssignment.findUnique({
      where: { id: assignmentId },
      include: { cycle: true },
    })

    if (!assignment) throw new NotFoundException('KPI assignment not found')

    const isReviewer =
      this.canManageKpi(user) || assignment.managerId === user.userId

    if (!isReviewer) {
      throw new ForbiddenException('Only HR/DH/manager can review KPI items')
    }

    if (!this.isReviewWindowOpen(assignment.cycle) && !this.canManageKpi(user)) {
      throw new ForbiddenException('KPI review window is closed')
    }

    const item = await this.prisma.kpiAssignmentItem.findFirst({
      where: { id: itemId, assignmentId },
    })

    if (!item) throw new NotFoundException('KPI item not found')

    const managerScore = Number(body.managerScore ?? 0)

    if (
      !Number.isFinite(managerScore) ||
      managerScore < 0 ||
      managerScore > item.weight
    ) {
      throw new BadRequestException(
        `Manager score must be between 0 and ${item.weight}`,
      )
    }

    await this.prisma.kpiAssignmentItem.update({
      where: { id: itemId },
      data: {
        managerScore,
        managerComments: String(body.managerComments || '').trim() || null,
        currentScore: this.isTaskLinkedKpiItem(item)
          ? item.currentScore
          : managerScore,
      },
    })

    return this.recalculateAssignment(assignmentId, user)
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

    if (!this.isReviewWindowOpen(assignment.cycle) && !this.canManageKpi(user)) {
      throw new ForbiddenException('KPI review window is closed')
    }

    const adjustment = Number(body.adjustment || 0)

    if (!Number.isFinite(adjustment) || adjustment < -25 || adjustment > 25) {
      throw new BadRequestException('Adjustment must be between -25 and 25')
    }

    const comment = String(body.comment || '').trim()

    if (!comment) {
      throw new BadRequestException('Feedback comment is required')
    }

    await this.prisma.kpiFeedback.create({
      data: {
        assignmentId: id,
        reviewerId: user.userId,
        phase: (body.phase || KpiReviewPhase.FINAL) as KpiReviewPhase,
        rating: body.rating || null,
        comment,
        adjustment,
      },
    })

    await this.prisma.kpiAssignment.update({
      where: { id },
      data: {
        managerAdjustment: adjustment,
        managerFinalComments: comment,
        status: KpiAssignmentStatus.REVIEWED,
      },
    })

    return this.recalculateAssignment(id, user)
  }
}
