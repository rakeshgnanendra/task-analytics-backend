import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  async create(name: string) {
    const exists = await this.prisma.department.findUnique({
      where: { name },
    })

    if (exists) {
      throw new BadRequestException('Department already exists')
    }

    return this.prisma.department.create({
      data: { name },
    })
  }

  async findAll() {
    return this.prisma.department.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
    })

    if (!dept) throw new NotFoundException('Department not found')
    return dept
  }

  async update(id: string, name: string) {
    return this.prisma.department.update({
      where: { id },
      data: { name },
    })
  }

  async delete(id: string) {
    const usersCount = await this.prisma.user.count({
      where: { departmentId: id },
    })

    if (usersCount > 0) {
      throw new BadRequestException(
        'Cannot delete department with users assigned',
      )
    }

    return this.prisma.department.delete({
      where: { id },
    })
  }
  async getDepartmentTasks(departmentId: string) {
  return this.prisma.task.findMany({
    where: {
      departmentId,
      isDeleted: false,
    },
    include: {
      assignedTo: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
async getDepartmentDashboard(departmentId: string) {

  const tasks = await this.prisma.task.findMany({
    where: {
      departmentId,
      isDeleted: false
    }
  });

  const total = tasks.length;

  const completed = tasks.filter(
    t => t.status === 'CONFIRMED'
  ).length;

  const inProgress = tasks.filter(
    t => t.status === 'IN_PROGRESS'
  ).length;

  const overdue = tasks.filter(
    t =>
      new Date(t.dueDate) < new Date() &&
      t.status !== 'CONFIRMED'
  ).length;

  const completionRate =
    total === 0
      ? 0
      : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    inProgress,
    overdue,
    completionRate
  };

}
async assignUser(departmentId: string, userId: string) {
  return this.prisma.user.update({
    where: { id: userId },
    data: { departmentId, departmentLeadId: null, isDepartmentLead: false },
  })
}
async setLeadStatus(departmentId: string, userId: string, isDepartmentLead: boolean) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.departmentId !== departmentId) {
    throw new BadRequestException('User is not part of this department')
  }

  if (!isDepartmentLead) {
    await this.prisma.user.updateMany({
      where: { departmentLeadId: userId },
      data: { departmentLeadId: null },
    })
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: {
      isDepartmentLead,
      departmentLeadId: isDepartmentLead ? null : user.departmentLeadId,
    },
    include: {
      departmentLead: { select: { id: true, firstName: true, lastName: true } },
      departmentTeamMembers: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  })
}
async assignTeamLead(departmentId: string, userId: string, leadId: string | null) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.departmentId !== departmentId) {
    throw new BadRequestException('User is not part of this department')
  }

  if (leadId) {
    if (leadId === userId) {
      throw new BadRequestException('User cannot report to themselves')
    }

    const lead = await this.prisma.user.findUnique({
      where: { id: leadId },
    })

    if (!lead || lead.departmentId !== departmentId || !lead.isDepartmentLead) {
      throw new BadRequestException('Selected lead is not a department lead')
    }
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: { departmentLeadId: leadId },
    include: {
      departmentLead: { select: { id: true, firstName: true, lastName: true } },
      departmentTeamMembers: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  })
}
async getUsers(departmentId: string) {
  return this.prisma.user.findMany({
    where: {
      departmentId: departmentId,
    },
    include: {
      departmentLead: { select: { id: true, firstName: true, lastName: true } },
      departmentTeamMembers: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [
      { isDepartmentLead: 'desc' },
      { firstName: 'asc' },
      { lastName: 'asc' },
    ],
  })
}
}
