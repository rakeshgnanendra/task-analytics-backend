import {
  Controller,
  Post,
  Patch,
  Param,
  Get,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  Res,
} from '@nestjs/common'
import { TaskService } from './task.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { Priority } from '@prisma/client'
import { TaskStatus } from '@prisma/client'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { join } from 'path'
import { diskStorage } from 'multer'
import { extname } from 'path'
import express from 'express'

@Controller('tasks')
export class TaskController {
  constructor(private taskService: TaskService) {}

@Post()
@UseGuards(JwtAuthGuard)
@UseInterceptors(
  FilesInterceptor("files", 10, {
    storage: diskStorage({
      destination: join(process.cwd(), "uploads"),
      filename: (req, file, callback) => {

        const uniqueName =
          Date.now() + "-" + Math.round(Math.random() * 1e9)

        callback(null, uniqueName + extname(file.originalname))

      }
    })
  })
)
async createTask(
  @CurrentUser() user: any,
  @UploadedFiles() files: Express.Multer.File[],
  @Body("projectId") projectId: string,
  @Body("departmentId") departmentId: string, // ✅ ADD THIS
  @Body("title") title: string,
  @Body("description") description: string,
  @Body("assignedToId") assignedToId: string,
  @Body("dueDate") dueDate: string,
  @Body("priority") priority: Priority,
) {

  return this.taskService.createTask(
    projectId || null,        // 1
    departmentId || null,     // 2 ❗ NEW
    user.userId,              // 3
    user.role,                // 4 ❗ NEW
    title,                    // 5
    description,              // 6
    assignedToId,             // 7
    new Date(dueDate),        // 8
    priority,                 // 9
    files                     // 10
  )

}
@UseGuards(JwtAuthGuard)
@Delete(':id')
async deleteTask(
  @Param('id') taskId: string,
  @CurrentUser() user: any,
) {

  return this.taskService.deleteTask(
    taskId,
    user.userId,
    user.role
  )

}

  @UseGuards(JwtAuthGuard)
@Get('/user/:userId')
async getTasksByUser(
  @Param('userId') userId: string,
) {
  return this.taskService.getTasksByUser(userId)
}
  @UseGuards(JwtAuthGuard)
@Get()
async getTasks(@CurrentUser() user: any) {
  return this.taskService.getTasks(user.userId, user.role)
}
@UseGuards(JwtAuthGuard)
@Patch(':id/status')
async updateStatus(
  @Param('id') taskId: string,
  @CurrentUser() user: any,
  @Body('status') status: TaskStatus,
) {
  return this.taskService.updateTaskStatus(
    taskId,
    user.userId,
    user.role,
    status,
  )
}
@Get(':id/logs')
@UseGuards(JwtAuthGuard)
async getLogs(@Param('id') taskId: string) {
  return this.taskService.getTaskLogs(taskId)
}
@UseGuards(JwtAuthGuard)
@Post(':id/upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: join(process.cwd(), 'uploads'),
      filename: (req, file, callback) => {
        const uniqueName =
          Date.now() + '-' + Math.round(Math.random() * 1e9)

        callback(null, uniqueName + extname(file.originalname))
      },
    }),
  }),
)
async uploadFile(
  @Param('id') taskId: string,
  @UploadedFiles() file: Express.Multer.File,
  @Req() req: any,
) {
  console.log('FILE RECEIVED:', file)
  console.log('FILENAME:', file?.filename)

  return this.taskService.uploadFile(
    taskId,
    req.user.userId,
    file,
  )
}
@UseGuards(JwtAuthGuard)
@Delete(':taskId/files/:fileId')
async deleteFile(
  @Param('taskId') taskId: string,
  @Param('fileId') fileId: string,
  @Req() req: any,
) {
  return this.taskService.deleteFile(
    taskId,
    fileId,
    req.user.userId,
    req.user.role,
  )
}
@UseGuards(JwtAuthGuard)
@Get(':taskId/files')
async getFiles(@Param('taskId') taskId: string) {
  return this.taskService.getFilesByTask(taskId)
}
@UseGuards(JwtAuthGuard)
@Get('files/:fileId/download')
async downloadFile(
  @Param('fileId') fileId: string,
  @Req() req: any,
  @Res() res: express.Response,
) {
  return this.taskService.downloadFile(
    fileId,
    req.user.userId,
    res,
  )
}
@UseGuards(JwtAuthGuard)
@Patch(':id')
async updateTask(
  @Param('id') taskId: string,
  @CurrentUser() user: any,
  @Body() body: any,
) {
  return this.taskService.updateTask(
    taskId,
    user.userId,
    user.role,
    body,
  )
}
@UseGuards(JwtAuthGuard)
@Patch(':id/reassign')
async reassignTask(
  @Param('id') taskId: string,
  @Body('assignedToId') assignedToId: string,
  @CurrentUser() user: any,
) {
  return this.taskService.reassignTask(
    taskId,
    assignedToId,
    user.userId,
    user.role,
  )
}
@UseGuards(JwtAuthGuard)
@Patch(':id/extend-due-date')
async extendDueDate(
  @Param('id') taskId: string,
  @Body('dueDate') dueDate: string,
  @CurrentUser() user: any,
) {
  return this.taskService.extendDueDate(
    taskId,
    new Date(dueDate),
    user.userId,
    user.role,
  )
}
@UseGuards(JwtAuthGuard)
@Patch(':id/priority')
async updatePriority(
  @Param('id') taskId: string,
  @Body('priority') priority: Priority,
  @CurrentUser() user: any,
) {
  return this.taskService.updatePriority(
    taskId,
    priority,
    user.userId,
    user.role,
  )
}
@UseGuards(JwtAuthGuard)
@Get(':projectId/tasks')
getTasksByProject(
  @Param('projectId') projectId: string,
  @CurrentUser() user: any,
) {
  return this.taskService.getTasksByProject(
    projectId,
    user.userId,
  )
}
@Get('next-task')
@UseGuards(JwtAuthGuard)
getNextTask(@Req() req) {
   console.log("USER FROM TOKEN:", req.user)
  return this.taskService.getNextTask(req.user.userId)
}
}
