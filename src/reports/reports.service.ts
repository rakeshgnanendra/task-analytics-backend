import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import type { Response } from 'express'
import PDFDocument from 'pdfkit'
import * as path from 'path'
import { filter } from 'rxjs'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}
private formatMinutesAsHHMM(minutes?: number | null) {
  const total = Math.max(0, minutes || 0)
  const hours = Math.floor(total / 60)
  const mins = total % 60

  return `${hours.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}`
}

private getDateRange(
  duration: string,
  startDate?: string,
  endDate?: string,
) {
  const today = new Date()

  let start: Date
  let end: Date = new Date()
  let label = 'Custom Report'

  if (duration === 'fy') {
    const month = today.getMonth()
    const year = today.getFullYear()
    const startYear = month >= 8 ? year : year - 1
    const endYear = startYear + 1

    start = new Date(startYear, 8, 1)
    end = new Date(endYear, 7, 31, 23, 59, 59, 999)
    label = `FY ${startYear}-${String(endYear).slice(-2)} Report`
  }

  else if (duration === '1m') {
    start = new Date()
    start.setMonth(start.getMonth() - 1)
    label = 'Monthly Report'
  }

  else if (duration === '3m') {
    start = new Date()
    start.setMonth(start.getMonth() - 3)
    label = 'Quarterly Report'
  }

  else if (duration === '6m') {
    start = new Date()
    start.setMonth(start.getMonth() - 6)
    label = 'Half-Yearly Report'
  }

  else if (duration === 'custom') {
    if (!startDate || !endDate) {
      throw new Error('Start and End date required')
    }

    start = new Date(startDate)
    end = new Date(endDate)
    label = 'Custom Report'
  }

  else {
    // default fallback
    start = new Date()
    start.setMonth(start.getMonth() - 1)
    label = 'Monthly Report'
  }

  return { start, end, label }
}

  async generateTaskReport(
  duration: string,
  startDate: string,
  endDate: string,
  type: string,
  entityId: string,
  res: Response,
  
  ) {
const { start, end, label } = this.getDateRange(
  duration, // for now (we will make dynamic later)
  startDate,
  endDate,
)
const filter: any = {}
let entityName = 'Team'
if (type === 'employee') {
  filter.assignedToId = entityId

  const user = await this.prisma.user.findUnique({
    where: { id: entityId },
  })

  if (user) {
    entityName = `${user.firstName} ${user.lastName}`
  }
}

else if (type === 'project') {
  filter.projectId = entityId

  const project = await this.prisma.project.findUnique({
    where: { id: entityId },
  })

  if (project) {
    entityName = project.name
  }
}

else if (type === 'department') {
  filter.departmentId = entityId

  const dept = await this.prisma.department.findUnique({
    where: { id: entityId },
  })

  if (dept) {
    entityName = dept.name
  }
}

else if (type === 'team') {
  // same as project for now
  filter.projectId = entityId

  const project = await this.prisma.project.findUnique({
    where: { id: entityId },
  })

  if (project) {
    entityName = project.name
  }
}

    // 🧠 FETCH DATA
    const tasks = await this.prisma.task.findMany({
      where: {
       createdAt: {
  gte: start,
  lte: end,
},
       ...filter,
      },
      include: {
        assignedTo: true,
        project: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // 🧠 SUMMARY
    const totalTasks = tasks.length
    const completed = tasks.filter(t => t.status === 'COMPLETED').length
    const confirmed = tasks.filter(t => t.status === 'CONFIRMED').length
    const pending =
      tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CONFIRMED').length

    let totalMinutes = 0

    tasks.forEach(t => {
      totalMinutes += t.timeSpentMinutes || 0
   
    })

    // 🧠 USER NAME
    let userName = `${entityName}`
  

    // 📄 PDF INIT
    const doc = new PDFDocument({ margin: 40, size: [595.28, 1000] })

    res.setHeader('Content-Type', 'application/pdf')
    const today = new Date().toISOString().split('T')[0]
    const safeType = type || 'report'
const safeDuration = duration || 'custom'

const fileName = `TaskAnalytics_${safeType}_${safeDuration}_${today}.pdf`

res.setHeader(
  'Content-Disposition',
  `attachment; filename=${fileName}`
)

    doc.pipe(res)

    // 🏢 HEADER
    const logoPath = path.join(process.cwd(), 'public', 'DP_logo.png')
    doc.font('Helvetica-Bold').fontSize(16).fillColor('black').text('TASK ANALYTICS REPORT', 40, 34)
    doc.font('Helvetica').fontSize(8.5).text('DIGITAL PERSONAS PVT LTD', 40, 62)
    doc.text('DIGITAL PERSONAS PVT LTD., 703,', 40, 84)
    doc.text('GOWRA FOUNTAINHEAD, HUDA', 40, 96)
    doc.text('TECHNO ENCLAVE, HITEC CITY,', 40, 108)
    doc.text('MADHAPUR, TELANGANA,', 40, 120)
    doc.text('HYDERABAD, 500081.', 40, 132)

    try {
      doc.image(logoPath, 350, 30, { width: 170 })
    } catch {
      // Logo is optional in local/dev environments.
    }

    // ➖ LINE
    doc.moveTo(40, 160).lineTo(550, 160).strokeColor('#d1d5db').stroke()

    // 📌 TITLE
    doc.y = 178
   doc.font('Helvetica-Bold').fontSize(16).fillColor('black').text(`${userName} - ${label}`, {
  align: 'center',
})
doc.font('Helvetica')

    doc.text(
  `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
  { align: 'center' }
)

    doc.moveDown(2)

    // 📊 SUMMARY
    doc.font('Helvetica-Bold').fontSize(12).text('Summary')
    doc.font('Helvetica')

    doc.moveDown(0.5)
    doc.text(`Total Tasks: ${totalTasks}`)
    doc.text(`Completed: ${completed}`)
    doc.text(`Confirmed: ${confirmed}`)
    doc.text(`Pending: ${pending}`)
    doc.text(`Total Time: ${this.formatMinutesAsHHMM(totalMinutes)}`)

    doc.moveDown(1)

    // =========================
    // 🔥 PREMIUM TABLE START
    // =========================

    const tableTop = doc.y + 20
doc.y = tableTop 
const col0 = 40
    const col1 = col0 + 110   // Title (NO GAP)
const col2 = col1 + 160   // Status
const col3 = col2 + 90    // User
const col4 = col3 + 80 

    // 🔹 HEADER BOXES
    
    doc.font('Helvetica-Bold').fontSize(10)
// Ticket
doc.rect(col0, tableTop, 110, 20).stroke()
doc.text('Ticket', col0 + 5, tableTop + 5)

// Title
doc.rect(col1, tableTop, 160, 20).stroke()
doc.text('Title', col1 + 5, tableTop + 5)

// Status
doc.rect(col2, tableTop, 90, 20).stroke()
doc.text('Status', col2 + 5, tableTop + 5)

// User
doc.rect(col3, tableTop, 80, 20).stroke()
doc.text('User', col3 + 5, tableTop + 5)

// Time
doc.rect(col4, tableTop, 60, 20).stroke()
doc.text('Time', col4 + 5, tableTop + 5)
    let y = tableTop + 20

    doc.font('Helvetica').fontSize(9)

    // 🔹 ROWS
   const pageHeight = doc.page.height;
const bottomMargin = 50;
const rowHeight = 20;

tasks.forEach((task, index) => {
  // ✅ PAGE BREAK FIX
  if (y + rowHeight > pageHeight - bottomMargin) {
    doc.addPage();
    y = 100; // reset Y
  }

  const fullName = task.assignedTo
    ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
    : '-';

  const time = this.formatMinutesAsHHMM(task.timeSpentMinutes)
      

  // 🎨 Alternating row background
  if (index % 2 === 0) {
    doc.rect(col0, y, 500, rowHeight).fill('#f5f5f5');
    doc.fillColor('black');
  }

  // 🔥 CUT TEXT (NO WRAP)
  const trim = (text: string, max = 20) =>
    text && text.length > max ? text.substring(0, max) + '...' : text || '-';

  // Ticket
  doc.rect(col0, y, 110, rowHeight).stroke();
  doc.text(task.ticketId || '-', col0 + 5, y + 5, {
  width: 100,
  lineBreak: false, // 🔥 prevents wrapping
})


  // Title (🔥 FIX)
  doc.rect(col1, y, 160, rowHeight).stroke();
  doc.text(trim(task.title, 25), col1 + 5, y + 5, {
    width: 150,
    lineBreak: false,
  });

  // Status
  doc.rect(col2, y, 90, rowHeight).stroke();

  let statusColor = 'black';
  if (task.status === 'COMPLETED') statusColor = 'green';
  else if (task.status === 'REJECTED') statusColor = 'red';
  else if (task.status === 'IN_PROGRESS') statusColor = 'orange';
  else if (task.status === 'CREATED') statusColor = 'blue';

  doc.fillColor(statusColor).text(task.status, col2 + 8, y + 5, {
    lineBreak: false,
  });

  doc.fillColor('black');

  // User
  doc.rect(col3, y, 80, rowHeight).stroke();
  doc.text(trim(fullName, 15), col3 + 5, y + 5, {
    lineBreak: false,
  });

  // Time
  doc.rect(col4, y, 60, rowHeight).stroke();
  doc.text(time, col4 + 5, y + 5, {
    lineBreak: false,
  });

  y += rowHeight;
});
    doc.y = y + 10

    // =========================
    // 🔥 PREMIUM TABLE END
    // =========================

    // 📌 FOOTER
   // 📌 FOOTER (PROFESSIONAL CENTERED)
const footerY = doc.page.height - 38
const previousY = doc.y
doc
  .font('Helvetica-Oblique')
  .fontSize(9)
  .fillColor('gray')
  .text('Generated by Task Analytics System', 40, footerY, {
    width: 510,
    align: 'center',
  })
doc.y = previousY
doc.fillColor('black')

    doc.end()
  }

  async generateTaskCsvReport(
    duration: string,
    startDate: string,
    endDate: string,
    type: string,
    entityId: string,
    res: Response,
  ) {
    const { start, end } = this.getDateRange(duration, startDate, endDate)
    const filter: any = {}

    if (type === 'employee') {
      filter.assignedToId = entityId
    } else if (type === 'project' || type === 'team') {
      filter.projectId = entityId
    } else if (type === 'department') {
      filter.departmentId = entityId
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
        ...filter,
      },
      include: {
        assignedTo: true,
        project: true,
        department: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const escapeCsv = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }

    const formatDate = (value?: Date | string | null) =>
      value ? new Date(value).toISOString().split('T')[0] : ''

    const headers = [
      'Ticket ID',
      'Title',
      'Description',
      'Status',
      'Priority',
      'Assigned To',
      'Project',
      'Department',
      'Due Date',
      'Created Date',
      'Time Spent',
      'Rejected Comment',
    ]

    const rows = tasks.map((task) => {
      const assignedTo = task.assignedTo
        ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
        : ''

      return [
        task.ticketId,
        task.title,
        task.description,
        task.status,
        task.priority,
        assignedTo,
        task.project?.name,
        task.department?.name,
        formatDate(task.dueDate),
        formatDate(task.createdAt),
        this.formatMinutesAsHHMM(task.timeSpentMinutes),
        task.status === 'REJECTED' ? task.completionComment : '',
      ]
    })

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\r\n')

    const today = new Date().toISOString().split('T')[0]
    const safeType = type || 'report'
    const safeDuration = duration || 'custom'
    const fileName = `TaskAnalytics_${safeType}_${safeDuration}_${today}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
    res.send(csv)
  }
}
