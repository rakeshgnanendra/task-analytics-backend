import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { PrismaClient, GlobalRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async generateUniqueUsername(
    firstName: string,
    lastName: string,
  ) {
    const base = `${firstName}.${lastName}`
      .replace(/\s+/g, '.')
      .replace(/[^a-zA-Z0-9.]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '')
      || `user.${Date.now()}`

    let username = base
    let suffix = 1

    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${base}.${suffix}`
      suffix += 1
    }

    return username
  }

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
    const username =
      dto.username ||
      (await this.generateUniqueUsername(dto.firstName, dto.lastName))

    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        username,
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
async bulkCreateUsers(dto: any, creatorRole: string) {
  if (creatorRole !== 'SUPER_ADMIN' && creatorRole !== 'DELIVERY_HEAD') {
    throw new ForbiddenException('You cannot create users')
  }

  const rows = Array.isArray(dto?.users) ? dto.users : []

  if (rows.length === 0) {
    throw new BadRequestException('No users found in upload')
  }

  const results: any[] = []
  let created = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {}
    const rowNumber = index + 1

    try {
      const firstName = String(row.firstName || '').trim()
      const lastName = String(row.lastName || '').trim()
      const email = String(row.email || '').trim().toLowerCase()
      const designation = String(row.designation || '').trim() || null
      const requestedRole = String(row.role || GlobalRole.EMPLOYEE)
        .trim()
        .toUpperCase()
      const departmentName = String(row.department || row.departmentName || '')
        .trim()
      const departmentId = String(row.departmentId || '').trim()

      if (!firstName || !lastName || !email) {
        throw new BadRequestException('firstName, lastName, and email are required')
      }

      if (!departmentName && !departmentId) {
        throw new BadRequestException('department is required')
      }

      if (!Object.values(GlobalRole).includes(requestedRole as GlobalRole)) {
        throw new BadRequestException(`Invalid role ${requestedRole}`)
      }

      if (
        creatorRole === 'DELIVERY_HEAD' &&
        requestedRole !== GlobalRole.EMPLOYEE &&
        requestedRole !== GlobalRole.HR
      ) {
        throw new ForbiddenException(
          'Delivery Head can only create Employee or HR users',
        )
      }

      const existing = await this.prisma.user.findUnique({
        where: { email },
      })

      if (existing) {
        throw new BadRequestException('Email already exists')
      }

      let department = departmentId
        ? await this.prisma.department.findUnique({
            where: { id: departmentId },
          })
        : await this.prisma.department.findUnique({
            where: { name: departmentName },
          })

      if (!department && creatorRole === 'SUPER_ADMIN' && departmentName) {
        department = await this.prisma.department.create({
          data: { name: departmentName },
        })
      }

      if (!department) {
        throw new BadRequestException(`Department not found: ${departmentName}`)
      }

      const username = await this.generateUniqueUsername(firstName, lastName)
      const hashedPassword = await bcrypt.hash(
        row.password || 'Password123',
        10,
      )

      await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          username,
          email,
          password: hashedPassword,
          role: requestedRole as GlobalRole,
          designation,
          isActive: true,
          departmentId: department.id,
        },
      })

      created += 1
      results.push({ row: rowNumber, email, status: 'CREATED' })
    } catch (err) {
      results.push({
        row: rowNumber,
        email: row.email || '',
        status: 'FAILED',
        message: err?.message || 'Failed to create user',
      })
    }
  }

  return {
    total: rows.length,
    created,
    failed: rows.length - created,
    results,
  }
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
