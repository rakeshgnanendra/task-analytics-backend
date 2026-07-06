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
      if (![GlobalRole.EMPLOYEE, GlobalRole.HR].includes(dto.role)) {
        throw new ForbiddenException(
          'Delivery Head can only create Employee or HR users',
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
if (dto.departmentLeadId) {
  const lead = await this.prisma.user.findUnique({
    where: { id: dto.departmentLeadId },
  })

  if (!lead || lead.departmentId !== department.id || !lead.isDepartmentLead) {
    throw new BadRequestException('Invalid department lead')
  }
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
        designation: dto.designation || null,
        isDepartmentLead: Boolean(dto.isDepartmentLead),
        departmentLeadId: dto.departmentLeadId || null,
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
      exitedAt: user.isActive ? new Date() : null,
      exitReason: user.isActive ? 'Marked inactive' : null,
    },
  })
}

async markUserExited(
  userId: string,
  requesterRole: string,
  reason?: string,
) {
  if (requesterRole !== 'SUPER_ADMIN' && requesterRole !== 'DELIVERY_HEAD') {
    throw new ForbiddenException('Not allowed')
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new BadRequestException('User not found')
  }

  if (user.role === 'SUPER_ADMIN') {
    throw new ForbiddenException('Cannot mark Super Admin as exited')
  }

  if (requesterRole === 'DELIVERY_HEAD' && user.role === 'DELIVERY_HEAD') {
    throw new ForbiddenException('Cannot mark Delivery Head as exited')
  }

  return this.prisma.$transaction(async (tx) => {
    if (user.isDepartmentLead) {
      await tx.user.updateMany({
        where: { departmentLeadId: userId },
        data: { departmentLeadId: null },
      })
    }

    await tx.projectMember.deleteMany({
      where: { userId },
    })

    return tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        exitedAt: new Date(),
        exitReason: reason?.trim() || 'Exited organisation',
        isDepartmentLead: false,
        departmentLeadId: null,
      },
    })
  })
}

async reactivateUser(userId: string, requesterRole: string) {
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
    throw new ForbiddenException('Cannot reactivate Super Admin')
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      exitedAt: null,
      exitReason: null,
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
    designation: true,
    isActive: true,
    exitedAt: true,
    exitReason: true,
    isDepartmentLead: true,
    departmentLead: {
      select: { id: true, firstName: true, lastName: true },
    },
    departmentTeamMembers: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
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
