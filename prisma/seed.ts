import 'dotenv/config'
import { PrismaClient, GlobalRole } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  let department = await prisma.department.findUnique({
  where: { name: 'IT' },
})

if (!department) {
  department = await prisma.department.create({
    data: { name: 'IT' },
  })
}

  const superAdminPassword = await bcrypt.hash('Password123', 10)

  await prisma.user.create({
    data: {
      firstName: 'Super',
      lastName: 'Admin',
      username: 'super.admin',
      email: 'superadmin@digitalpersonas.com',
      password: superAdminPassword,
      role: GlobalRole.SUPER_ADMIN,
      isActive: true,
   departmentId: department!.id,
    },
  })

  console.log('Super Admin created successfully.')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })