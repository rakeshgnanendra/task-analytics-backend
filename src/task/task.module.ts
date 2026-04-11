import { Module } from '@nestjs/common'
import { TaskService } from './task.service'
import { TaskController } from './task.controller'

import { PrismaModule } from '../prisma/prisma.module';
import { LogsModule } from '../logs/logs.module';
import { NotificationModule } from 'src/notification/notification.module';
import { SocketModule } from 'src/socket/socket.module';

@Module({
  imports:[PrismaModule , LogsModule,NotificationModule,SocketModule ],
  controllers: [TaskController],
  providers: [TaskService],
  
})
export class TaskModule {}
