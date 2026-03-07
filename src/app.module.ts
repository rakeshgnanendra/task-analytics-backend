import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProjectModule } from './project/project.module';
import { APP_GUARD } from '@nestjs/core'
import { RolesGuard } from './auth/roles.guard'
import { TaskModule } from './task/task.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { LogsModule } from './logs/logs.module';
import { DepartmentModule } from './department/department.module';

@Module({
  imports: [AuthModule, ProjectModule, TaskModule , DashboardModule, UsersModule, PrismaModule, LogsModule, DepartmentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
