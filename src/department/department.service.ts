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
}