import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { PrismaClient, GlobalRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createUser(dto: any, creatorRole: string) {
    // 🔐 Role hierarchy validation
    if (creatorRole === 'SUPER_ADMIN') {
      // Can create any role
    } 
    else if (creatorRole === 'DELIVERY_HEAD') {
      if (dto.role !== GlobalRole.EMPLOYEE) {
        throw new ForbiddenException(
          'Delivery Head can only create normal users',
        )
      }
    } 
    else {
      throw new ForbiddenException('You cannot create users')
    }

    // 🔥 Enforce single DELIVERY_HEAD
    if (dto.role === GlobalRole.DELIVERY_HEAD) {
      if (creatorRole !== GlobalRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only Super Admin can create Delivery Head',
        )
      }

      await this.prisma.user.updateMany({
        where: {
          role: GlobalRole.DELIVERY_HEAD,
          isActive: true,
        },
        data: {
          role: GlobalRole.EMPLOYEE,
        },
      })
    }

    // Check duplicate email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (existing) {
      throw new BadRequestException('Email already exists')
    }
const department = await this.prisma.department.findUnique({
  where: { id: dto.departmentId },
})
if (!department) {
  throw new BadRequestException('Invalid department')
}
    const hashedPassword = await bcrypt.hash(dto.password, 10)

    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
        isActive: true,
        departmentId: department.id,
      },
    })
  }
async toggleUserStatus(userId: string, requesterRole: string) {

  if (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'DELIVERY_HEAD') {
    throw new ForbiddenException('Not allowed')
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new BadRequestException('User not found')
  }

  if (requesterRole === 'DELIVERY_HEAD' && user.role === 'SUPER_ADMIN') {
    throw new ForbiddenException('Cannot deactivate Super Admin')
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: {
      isActive: !user.isActive,
    },
  })
}
async getUsers(query: any, requesterRole: string) {
  if (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'DELIVERY_HEAD') {
    throw new ForbiddenException('Not allowed to view users')
  }

  const page = parseInt(query.page) || 1
  const limit = parseInt(query.limit) || 10
  const skip = (page - 1) * limit

  const where: any = {}

  if (query.role) {
    where.role = query.role
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive === 'true'
  }

  if (query.departmentId) {
    where.departmentId = query.departmentId
  }

  const [users, total] = await Promise.all([
  this.prisma.user.findMany({
  where,
  skip,
  take: limit,
  orderBy: { createdAt: 'desc' },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    username: true,
    email: true,
    role: true,
    isActive: true,
    department: {
      select: { id: true, name: true },
    },
    projectLinks: {
      select: {
        role: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    createdAt: true,
  },
}),
    this.prisma.user.count({ where }),
  ])

  return {
    data: users,
    meta: {
      total,
      page,
      limit,
     
    },
  }
}
async updateUserRole(
  userId: string,
  newRole: string,
  requesterRole: string,
) {
  // Only SUPER_ADMIN can change roles
  if (requesterRole !== 'SUPER_ADMIN') {
    throw new ForbiddenException('Only Super Admin can change roles')
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new BadRequestException('User not found')
  }

  // Prevent promoting someone to SUPER_ADMIN
  if (newRole === 'SUPER_ADMIN') {
    throw new ForbiddenException('Cannot assign SUPER_ADMIN role')
  }

  // 🔥 Enforce single DELIVERY_HEAD
  if (newRole === 'DELIVERY_HEAD') {
    await this.prisma.user.updateMany({
      where: {
        role: 'DELIVERY_HEAD',
        isActive: true,
      },
      data: {
        role: 'EMPLOYEE',
      },
    })
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: {
      role: newRole as any,
    },
  })
}
}