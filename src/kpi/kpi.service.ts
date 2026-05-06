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
      cycle.status === KpiCycleStatus.REVIEW_OPEN &&
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
    const doc = new PDFDocument({ margin: 36, size: [595.28, 1000] })
    const today = new Date().toISOString().split('T')[0]
    const fileName = `KPI_${summary.employeeName.replace(/\s+/g, '_')}_${summary.financialYear.replace(/\s+/g, '_')}_${today}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
    doc.pipe(res)

    const logoPath = path.join(process.cwd(), 'public', 'DP_logo.png')
    const pageWidth = doc.page.width
    const left = 36
    const right = pageWidth - 36
    const contentWidth = right - left
    const colors = {
      indigo: '#4f46e5',
      slate: '#111827',
      muted: '#6b7280',
      line: '#e5e7eb',
      soft: '#f8fafc',
      green: '#16a34a',
    }
    const formatDate = (value?: Date | string | null) =>
      value ? new Date(value).toLocaleDateString('en-IN') : '-'
    const trim = (text: string, max = 60) =>
      text && text.length > max ? `${text.substring(0, max)}...` : text || '-'
    const ensureSpace = (height: number) => {
      if (doc.y + height > doc.page.height - 52) {
        doc.addPage()
        doc.y = 36
      }
    }
    const sectionTitle = (title: string) => {
      ensureSpace(30)
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(colors.slate)
        .text(title, left, doc.y)
      doc.moveDown(0.45)
      doc
        .moveTo(left, doc.y)
        .lineTo(right, doc.y)
        .strokeColor(colors.line)
        .stroke()
      doc.moveDown(0.8)
    }
    const drawInfoCard = (
      x: number,
      y: number,
      width: number,
      label: string,
      value: string,
      accent = colors.slate,
    ) => {
      doc.roundedRect(x, y, width, 48, 6).strokeColor(colors.line).stroke()
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(colors.muted)
        .text(label, x + 10, y + 8, { width: width - 20, lineBreak: false })
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(accent)
        .text(value, x + 10, y + 25, { width: width - 20, lineBreak: false })
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(colors.slate)
      .text('KPI PERFORMANCE REPORT', left, 34)
    doc.font('Helvetica').fontSize(8.5).fillColor(colors.slate)
    doc.text('DIGITAL PERSONAS PVT LTD', left, 62)
    doc.text('DIGITAL PERSONAS PVT LTD., 703,', left, 84)
    doc.text('GOWRA FOUNTAINHEAD, HUDA', left, 96)
    doc.text('TECHNO ENCLAVE, HITEC CITY,', left, 108)
    doc.text('MADHAPUR, TELANGANA,', left, 120)
    doc.text('HYDERABAD, 500081.', left, 132)
    try {
      doc.image(logoPath, right - 170, 30, { width: 170 })
    } catch {
      // Logo is optional in local/dev environments.
    }
    doc.moveTo(left, 160).lineTo(right, 160).strokeColor(colors.line).stroke()

    doc.y = 178
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(colors.slate)
      .text(summary.employeeName, left, doc.y)
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text(`${summary.financialYear} appraisal summary`, left, doc.y + 3)
    doc.moveDown(1.6)

    const cardGap = 12
    const cardWidth = (contentWidth - cardGap * 3) / 4
    const cardY = doc.y
    drawInfoCard(
      left,
      cardY,
      cardWidth,
      'Final Score',
      String(Math.round(summary.finalScore || 0)),
      colors.indigo,
    )
    drawInfoCard(
      left + cardWidth + cardGap,
      cardY,
      cardWidth,
      'Auto Score',
      String(Math.round(summary.autoScore || 0)),
    )
    drawInfoCard(
      left + (cardWidth + cardGap) * 2,
      cardY,
      cardWidth,
      'Rating',
      summary.rating || '-',
    )
    drawInfoCard(
      left + (cardWidth + cardGap) * 3,
      cardY,
      cardWidth,
      'Status',
      summary.reviewStatus || '-',
      summary.reviewStatus === 'FINALIZED' ? colors.green : colors.slate,
    )
    doc.y = cardY + 64

    sectionTitle('Employee Details')
    const detailRows = [
      ['Employee', summary.employeeName],
      ['Designation', assignment.employee.designation || assignment.employee.role],
      ['Department', assignment.employee.department?.name || '-'],
      ['Manager', summary.managerName],
      ['Cycle Start', formatDate(assignment.cycle.startDate)],
      ['Cycle End', formatDate(assignment.cycle.endDate)],
    ]
    const detailY = doc.y
    const detailColWidth = contentWidth / 3
    detailRows.forEach(([label, value], index) => {
      const x = left + (index % 3) * detailColWidth
      const y = detailY + Math.floor(index / 3) * 31
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(colors.muted)
        .text(label, x, y, { width: detailColWidth - 12 })
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colors.slate)
        .text(String(value), x, y + 13, {
          width: detailColWidth - 12,
          lineBreak: false,
        })
    })
    doc.y = detailY + 68

    sectionTitle('KPI Breakdown')

    const drawHeader = () => {
      const y = doc.y
      doc.rect(left, y, contentWidth, 24).fill(colors.indigo)
      doc.font('Helvetica-Bold').fontSize(8).fillColor('white')
      doc.text('Category', left + 8, y + 8, { width: 150, lineBreak: false })
      doc.text('Weight', left + 178, y + 8)
      doc.text('Score', left + 236, y + 8)
      doc.text('Tasks', left + 294, y + 8)
      doc.text('Manager Comment', left + 350, y + 8)
      doc.y = y + 24
      doc.fillColor(colors.slate)
    }

    drawHeader()

    assignment.items.forEach((item, index) => {
      const rowHeight = 42
      ensureSpace(rowHeight + 10)
      const y = doc.y

      if (index % 2 === 0) {
        doc.rect(left, y, contentWidth, rowHeight).fill(colors.soft)
      }
      doc.rect(left, y, contentWidth, rowHeight).strokeColor(colors.line).stroke()

      doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.slate)
      doc.text(trim(item.category, 32), left + 8, y + 8, {
        width: 150,
        lineBreak: false,
      })
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(colors.muted)
        .text(trim(item.goal || '', 48), left + 8, y + 20, {
          width: 150,
          lineBreak: false,
        })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.slate)
      doc.text(`${item.weight}%`, left + 178, y + 15, { width: 44 })
      doc.fillColor(colors.indigo).text(
        `${Math.round(item.currentScore || 0)}`,
        left + 236,
        y + 15,
        { width: 40 },
      )
      doc.fillColor(colors.slate).text(`${item.tasks?.length || 0}`, left + 294, y + 15)
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(colors.slate)
        .text(trim(item.managerComments || '-', 72), left + 350, y + 10, {
          width: contentWidth - 360,
          lineBreak: false,
        })
      doc.y = y + rowHeight
    })

    doc.moveDown(1.2)
    const managerFeedback = summary.managerFinalComments || '-'
    ensureSpace(
      48 +
        doc.heightOfString(managerFeedback, {
          width: contentWidth,
          lineGap: 3,
        }),
    )
    sectionTitle('Manager Feedback')
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.slate)
      .text(managerFeedback, left, doc.y, {
        width: contentWidth,
        lineGap: 3,
      })

    doc.moveDown(1.2)
    const acknowledgementText = summary.employeeAcknowledgementComment || '-'
    ensureSpace(
      62 +
        doc.heightOfString(acknowledgementText, {
          width: contentWidth,
          lineGap: 3,
        }),
    )
    sectionTitle('Employee Acknowledgement')
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(summary.employeeAcknowledgedAt ? colors.green : colors.muted)
      .text(
        summary.employeeAcknowledgedAt
          ? `Acknowledged on ${formatDate(summary.employeeAcknowledgedAt)}`
          : 'Pending acknowledgement',
        left,
        doc.y,
      )
    doc.moveDown(0.4)
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.slate)
      .text(acknowledgementText, left, doc.y, {
        width: contentWidth,
        lineGap: 3,
      })

    const footerY = doc.page.height - 42
    const previousY = doc.y
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(colors.muted)
      .text(`Generated by Task Analytics System on ${formatDate(new Date())}`, left, footerY, {
        width: contentWidth,
        align: 'center',
      })
    doc.y = previousY

    doc.end()
  }

  async generateKpiCycleSummaryPdf(cycleId: string, user: any, res: Response) {
    this.assertCanManageKpi(user)

    const cycle = await this.prisma.kpiCycle.findUnique({
      where: { id: cycleId },
      include: {
        assignments: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                designation: true,
                department: true,
              },
            },
            manager: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ employee: { firstName: 'asc' } }, { employee: { lastName: 'asc' } }],
        },
      },
    })

    if (!cycle) throw new NotFoundException('KPI cycle not found')

    const doc = new PDFDocument({ margin: 36, size: [595.28, 1000] })
    const fileSafeName = cycle.financialYear.replace(/\s+/g, '_')
    const today = new Date().toISOString().split('T')[0]

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=KPI_Summary_${fileSafeName}_${today}.pdf`,
    )
    doc.pipe(res)

    const logoPath = path.join(process.cwd(), 'public', 'DP_logo.png')
    const left = 36
    const right = doc.page.width - 36
    const contentWidth = right - left
    const colors = {
      indigo: '#4f46e5',
      slate: '#111827',
      muted: '#6b7280',
      line: '#e5e7eb',
      soft: '#f8fafc',
      green: '#16a34a',
    }
    const formatDate = (value?: Date | string | null) =>
      value ? new Date(value).toLocaleDateString('en-IN') : '-'
    const trim = (text: string, max = 160) =>
      text && text.length > max ? `${text.substring(0, max)}...` : text || '-'
    const employeeName = (assignment: any) =>
      `${assignment.employee?.firstName || ''} ${assignment.employee?.lastName || ''}`.trim() ||
      '-'
    const managerName = (assignment: any) =>
      assignment.manager
        ? `${assignment.manager.firstName} ${assignment.manager.lastName}`.trim()
        : '-'
    const drawHeader = () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(colors.slate)
        .text('KPI SUMMARY REPORT', left, 34)
      doc.font('Helvetica').fontSize(8.5).fillColor(colors.slate)
      doc.text('DIGITAL PERSONAS PVT LTD', left, 62)
      doc.text('DIGITAL PERSONAS PVT LTD., 703,', left, 84)
      doc.text('GOWRA FOUNTAINHEAD, HUDA', left, 96)
      doc.text('TECHNO ENCLAVE, HITEC CITY,', left, 108)
      doc.text('MADHAPUR, TELANGANA,', left, 120)
      doc.text('HYDERABAD, 500081.', left, 132)

      try {
        doc.image(logoPath, right - 170, 30, { width: 170 })
      } catch {
        // Logo is optional in local/dev environments.
      }

      doc.moveTo(left, 160).lineTo(right, 160).strokeColor(colors.line).stroke()
      doc.y = 178
    }
    const drawFooter = () => {
      const previousY = doc.y
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(colors.muted)
        .text(`Generated by Task Analytics System on ${formatDate(new Date())}`, left, doc.page.height - 42, {
          width: contentWidth,
          align: 'center',
        })
      doc.y = previousY
    }
    const drawTableHeader = () => {
      const y = doc.y
      doc.rect(left, y, contentWidth, 24).fill(colors.indigo)
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white')
      doc.text('Employee', left + 6, y + 8, { width: 108, lineBreak: false })
      doc.text('Manager', left + 122, y + 8, { width: 76, lineBreak: false })
      doc.text('Status', left + 204, y + 8, { width: 64, lineBreak: false })
      doc.text('Auto', left + 272, y + 8, { width: 34, align: 'right' })
      doc.text('Final', left + 312, y + 8, { width: 34, align: 'right' })
      doc.text('Ack', left + 354, y + 8, { width: 50, lineBreak: false })
      doc.text('Manager Final Comments', left + 410, y + 8, {
        width: contentWidth - 416,
        lineBreak: false,
      })
      doc.y = y + 24
    }

    drawHeader()

    const reviewedCount = cycle.assignments.filter((assignment) =>
      ['REVIEWED', 'ACKNOWLEDGED', 'FINALIZED'].includes(assignment.status),
    ).length
    const acknowledgedCount = cycle.assignments.filter(
      (assignment) => assignment.employeeAcknowledgedAt,
    ).length
    const averageScore = cycle.assignments.length
      ? Math.round(
          cycle.assignments.reduce(
            (sum, assignment) => sum + Number(assignment.finalScore || 0),
            0,
          ) / cycle.assignments.length,
        )
      : 0

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(colors.slate)
      .text(`${cycle.name} - ${cycle.financialYear}`, left, doc.y)
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(colors.muted)
      .text(`Review window: ${formatDate(cycle.managerReviewStart)} to ${formatDate(cycle.managerReviewEnd)}`)
    doc.moveDown(0.9)
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(colors.slate)
      .text(
        `Employees: ${cycle.assignments.length}    Reviewed: ${reviewedCount}    Acknowledged: ${acknowledgedCount}    Average Score: ${averageScore}`,
      )
    doc.moveDown(1.2)

    drawTableHeader()

    cycle.assignments.forEach((assignment, index) => {
      const comment = trim(assignment.managerFinalComments || '-', 180)
      const commentHeight = doc.heightOfString(comment, {
        width: contentWidth - 416,
        lineGap: 2,
      })
      const rowHeight = Math.max(34, Math.min(76, commentHeight + 16))

      if (doc.y + rowHeight > doc.page.height - 58) {
        drawFooter()
        doc.addPage()
        doc.y = 36
        drawTableHeader()
      }

      const y = doc.y
      if (index % 2 === 0) {
        doc.rect(left, y, contentWidth, rowHeight).fill(colors.soft)
      }
      doc.rect(left, y, contentWidth, rowHeight).strokeColor(colors.line).stroke()

      doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.slate)
      doc.text(employeeName(assignment), left + 6, y + 8, {
        width: 108,
        lineBreak: false,
      })
      doc
        .font('Helvetica')
        .fontSize(6.7)
        .fillColor(colors.muted)
        .text(assignment.employee?.designation || assignment.employee?.role || '-', left + 6, y + 19, {
          width: 108,
          lineBreak: false,
        })
      doc.font('Helvetica').fontSize(8).fillColor(colors.slate)
      doc.text(managerName(assignment), left + 122, y + 9, {
        width: 76,
        lineBreak: false,
      })
      doc.text(assignment.status || '-', left + 204, y + 9, {
        width: 64,
        lineBreak: false,
      })
      doc.text(String(Math.round(assignment.autoScore || 0)), left + 272, y + 9, {
        width: 34,
        align: 'right',
      })
      doc
        .font('Helvetica-Bold')
        .fillColor(colors.indigo)
        .text(String(Math.round(assignment.finalScore || 0)), left + 312, y + 9, {
          width: 34,
          align: 'right',
        })
      doc
        .font('Helvetica')
        .fillColor(assignment.employeeAcknowledgedAt ? colors.green : colors.muted)
        .text(assignment.employeeAcknowledgedAt ? 'Yes' : 'Pending', left + 354, y + 9, {
          width: 50,
          lineBreak: false,
        })
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(colors.slate)
        .text(comment, left + 410, y + 8, {
          width: contentWidth - 416,
          lineGap: 2,
        })

      doc.y = y + rowHeight
    })

    if (!cycle.assignments.length) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(colors.muted)
        .text('No KPI assignments found for this cycle.', left, doc.y + 14)
    }

    drawFooter()
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
