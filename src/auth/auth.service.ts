import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaClient,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }
    const token = this.jwtService.sign(payload)

    return {
      access_token: this.jwtService.sign(payload),
      user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      designation: user.designation,
      departmentId: user.departmentId,
    },
    mustChangePassword: user.mustChangePassword,
    }
  }
  async changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new UnauthorizedException('User not found')
  }

  const isMatch = await bcrypt.compare(
    currentPassword,
    user.password,
  )

  if (!isMatch) {
    throw new UnauthorizedException('Current password is incorrect')
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await this.prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword ,  mustChangePassword: false, },
  })

  return { message: 'Password updated successfully' }
}
}
