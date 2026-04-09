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
    data: { departmentId },
  })
}
async getUsers(departmentId: string) {
  return this.prisma.user.findMany({
    where: {
      departmentId: departmentId,
    },
  })
}
}