import { Module } from '@nestjs/common'
import { DepartmentService } from './department.service'
import { DepartmentController } from './department.controller'
import { PrismaModule } from 'src/prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentController],
  providers: [DepartmentService],
})
export class DepartmentModule {}