import * as fs from 'fs'
import { join } from 'path'
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  
} from '@nestjs/common'
import {
 
  TaskStatus,
  Priority,
  ProjectRole,
 
} from '@prisma/client'
import { Response } from 'express'
import { LogsService } from 'src/logs/logs.service'
import { PrismaService } from 'src/prisma/prisma.service'
@Injectable()
export class TaskService {
 
   
  constructor(private prisma: PrismaService, private logService:LogsService) {}

  // =============================
  // CREATE TASK
  // =============================
  async createTask(
  projectId: string,
  creatorId: string,
  title: string,
  description: string,
  assignedToId: string,
  dueDate: Date,
  priority: Priority,
  files?: Express.Multer.File[],
) {

  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    throw new NotFoundException('Project not found')
  }

  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: creatorId,
      role: ProjectRole.PROJECT_MANAGER,
    },
  })

  if (!managerLink) {
    throw new ForbiddenException(
      'Only Project Manager can create tasks in this project',
    )
  }

  const memberLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: assignedToId,
    },
  })

  if (!memberLink) {
    throw new BadRequestException(
      'Assigned user is not a member of this project',
    )
  }

  const task = await this.prisma.task.create({
    data: {
      title,
      description,
      projectId,
      createdById: creatorId,
      assignedToId,
      dueDate,
      priority,
      status: TaskStatus.CREATED,
    },
  })

  // 🔹 Save attachments if provided
  if (files && files.length > 0) {

    await this.prisma.taskFile.createMany({
      data: files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        fileSize: file.size,
        taskId: task.id,
        uploadedById: creatorId,
      }))
    })

  }

  await this.logService.createLog(
    'TASK_CREATED',
    'TASK',
    task.id,
    assignedToId,
    {
      title: task.title,
      priority: task.priority,
    }
  )

  return this.prisma.task.findUnique({
    where: { id: task.id },

    include: {
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },

      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },

      files: true
    }
  })

}

  // =============================
  // GET TASKS (ROLE BASED)
  // =============================
  async getTasks(userId: string, globalRole: string) {

  if (globalRole === 'DELIVERY_HEAD') {
    return this.prisma.task.findMany({
      where: {
        isDeleted: false
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  }

  const managerProjects = await this.prisma.projectMember.findMany({
    where: {
      userId,
      role: ProjectRole.PROJECT_MANAGER
    },
    select: { projectId: true }
  })

  const projectIds = managerProjects.map(p => p.projectId)

  return this.prisma.task.findMany({
    where: {
      isDeleted: false,
      OR: [
        { assignedToId: userId },
        { projectId: { in: projectIds } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  })

}

  // =============================
  // UPDATE TASK STATUS
  // =============================
//  async updateTaskStatus(
//   taskId: string,
//   userId: string,
//   globalRole: string,
//   newStatus: TaskStatus,
// ) {
//  // ===============================
// // ROLE-BASED TRANSITION LOGIC
// // ===============================

// // Check if user is PM in this project
// const managerLink = await this.prisma.projectMember.findFirst({
//   where: {
//     projectId: task.projectId!,
//     userId,
//     role: ProjectRole.PROJECT_MANAGER,
//   },
// })

// // Check if user is assigned TM
// const isAssignedUser = task.assignedToId === userId

// // STATE MACHINE
// const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
//   CREATED: [TaskStatus.IN_PROGRESS],
//   IN_PROGRESS: [TaskStatus.COMPLETED],
//   COMPLETED: [TaskStatus.CONFIRMED, TaskStatus.REJECTED, TaskStatus.REWORK],
//   REWORK: [TaskStatus.IN_PROGRESS],
//   CONFIRMED: [],
//   REJECTED: [],
// }

// // 1️⃣ Validate transition exists
// if (!allowedTransitions[task.status].includes(newStatus)) {
//   throw new BadRequestException('Invalid status transition')
// }

// // 2️⃣ Role restrictions

// // TM rules
// if (isAssignedUser) {
//   if (
//     ![
//       TaskStatus.IN_PROGRESS,
//       TaskStatus.COMPLETED,
//     ].includes(newStatus)
//   ) {
//     throw new ForbiddenException(
//       'Team Member cannot perform this action',
//     )
//   }
// }

// // PM rules
// if (managerLink) {
//   if (
//     ![
//       TaskStatus.CONFIRMED,
//       TaskStatus.REJECTED,
//       TaskStatus.REWORK,
//     ].includes(newStatus)
//   ) {
//     throw new ForbiddenException(
//       'Project Manager cannot perform this action',
//     )
//   }
// }

// // Delivery Head override (optional governance power)
// if (globalRole === 'DELIVERY_HEAD') {
//   // Allow but still respect locked
// }


// }
async updateTaskStatus(
  taskId: string,
  userId: string,
  globalRole: string,
  newStatus: TaskStatus,
) {

  // 1️⃣ Fetch task first
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })

  if (!task) throw new NotFoundException('Task not found')

  if (task.isLocked)
    throw new ForbiddenException('Task is locked and cannot be modified')


  // 2️⃣ Check if user is PM in this project
  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId!,
      userId,
      role: ProjectRole.PROJECT_MANAGER,
    },
  })

  // 3️⃣ Check if user is assigned TM
  const isAssignedUser = task.assignedToId === userId


  // ===============================
  // STATE MACHINE
  // ===============================
  const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
    CREATED: [TaskStatus.IN_PROGRESS],
    IN_PROGRESS: [TaskStatus.COMPLETED],
    COMPLETED: [
      TaskStatus.CONFIRMED,
      TaskStatus.REJECTED,
      TaskStatus.REWORK,
    ],
    REWORK: [TaskStatus.IN_PROGRESS],
    CONFIRMED: [],
    REJECTED: [],
  }

  if (!allowedTransitions[task.status].includes(newStatus)) {
    throw new BadRequestException('Invalid status transition')
  }


  // ===============================
  // ROLE RESTRICTIONS
  // ===============================

  // Team Member rules
  if (isAssignedUser) {
   if (
  newStatus !== TaskStatus.IN_PROGRESS &&
  newStatus !== TaskStatus.COMPLETED
)
     {
      throw new ForbiddenException(
        'Team Member cannot perform this action',
      )
    }
  }

  // Project Manager rules
  if (managerLink) {
    if (
  newStatus !== TaskStatus.CONFIRMED &&
  newStatus !== TaskStatus.REJECTED &&
  newStatus !== TaskStatus.REWORK
)
     {
      throw new ForbiddenException(
        'Project Manager cannot perform this action',
      )
    }
  }

  // ===============================
  // UPDATE DATA
  // ===============================

  const updateData: any = {
    status: newStatus,
  }

  if (newStatus === TaskStatus.COMPLETED) {
    updateData.completedAt = new Date()
  }

  if (newStatus === TaskStatus.REWORK) {
    updateData.completedAt = null
  }

  if (newStatus === TaskStatus.CONFIRMED) {
    updateData.confirmedAt = new Date()
    updateData.isLocked = true
  }

  const updatedTask = await this.prisma.task.update({
    where: { id: taskId },
    data: updateData,
  })

  await this.logService.createLog(
    'TASK_STATUS_CHANGED',
    'TASK',
    taskId,
    userId,
    {
      from: task.status,
      to: newStatus,
    },
  )

  return updatedTask
}
async uploadFile(taskId: string, userId: string, file: Express.Multer.File) {
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })
 const memberLink = await this.prisma.projectMember.findFirst({
  where: {
    projectId: taskId!,
    userId
  }
})

if (!memberLink) {
  throw new ForbiddenException(
    "You are not part of this project"
  )
}

  if (!task) throw new NotFoundException('Task not found')

 if (task.status === 'CONFIRMED') {
    throw new ForbiddenException(
      'Cannot upload file. Task is already CONFIRMED',
    )
  }
  const fileRecord = await this.prisma.taskFile.create({
    data: {
      fileName: file.originalname,
      fileUrl: `/uploads/${file.filename}`,
      fileSize: file.size,
      taskId,
      uploadedById: userId,
    },
  })

  return fileRecord
}

  // =============================
  // GET TASK LOGS
  // =============================
  async getTaskLogs(taskId: string) {
  return this.prisma.activityLog.findMany({
    take: 50,
    where: {
      entityType: 'TASK',
      entityId: taskId,
    },
    include: {
      user: {
        select: { email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
  async deleteFile(
  taskId: string,
  fileId: string,
  userId: string,
  role: string,
) {
  // 1️⃣ Check task
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  if (task.status === 'CONFIRMED') {
    throw new ForbiddenException(
      'Cannot delete file. Task is CONFIRMED',
    )
  }

  // 2️⃣ Get file
  const file = await this.prisma.taskFile.findUnique({
    where: { id: fileId },
  })

  if (!file) {
    throw new NotFoundException('File not found')
  }

  if (file.taskId !== taskId) {
    throw new ForbiddenException('File does not belong to this task')
  }

  // 3️⃣ Permission check
  if (file.uploadedById !== userId) {
    // Check if project manager
    const managerLink = await this.prisma.projectMember.findFirst({
      where: {
        projectId: task.projectId!,
        userId,
        role: 'PROJECT_MANAGER',
      },
    })

    if (!managerLink) {
      throw new ForbiddenException(
        'You are not allowed to delete this file',
      )
    }
  }

  // 4️⃣ Delete from disk
  const filePath = join(process.cwd(), 'uploads', file.fileUrl.split('/').pop()!)

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  // 5️⃣ Delete from DB
  await this.prisma.taskFile.delete({
    where: { id: fileId },
  })

  return { message: 'File deleted successfully' }
}
async getFilesByTask(taskId: string) {
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  return this.prisma.taskFile.findMany({
    take: 50,
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  })
}
async downloadFile(
  fileId: string,
  userId: string,
  res: Response,
) {
  // 1️⃣ Find file
  const file = await this.prisma.taskFile.findUnique({
    where: { id: fileId },
    include: { task: true },
  })

  if (!file) {
    throw new NotFoundException('File not found')
  }

  // 2️⃣ Build full path
  const fileName = file.fileUrl.split('/').pop()!
  const filePath = join(process.cwd(), 'uploads', fileName)

  if (!fs.existsSync(filePath)) {
    throw new NotFoundException('File missing on server')
  }

  // 3️⃣ Track download log
  await this.prisma.fileDownloadLog.create({
    data: {
      fileId,
      userId,
    },
  })

  // 4️⃣ Increment download count
  await this.prisma.taskFile.update({
    where: { id: fileId },
    data: {
      downloadCount: {
        increment: 1,
      },
    },
  })

  // 5️⃣ Send file
  return res.sendFile(filePath)
}
async updateTask(
  taskId: string,
  userId: string,
  role: string,
  updateData: any,
) {
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  if (task.isLocked) {
    throw new ForbiddenException('Task is locked')
  }

  // DELIVERY_HEAD can update anything
  if (role === 'DELIVERY_HEAD') {
    return this.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    })
  }

  // PROJECT_MANAGER check
  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId!,
      userId,
      role: 'PROJECT_MANAGER',
    },
  })

  if (!managerLink) {
    throw new ForbiddenException(
      'Only Project Manager can update task details',
    )
  } 


if (!managerLink) {
  throw new ForbiddenException("Only project manager can confirm tasks");
}
  return this.prisma.task.update({
    where: { id: taskId },
    data: updateData,
  })
}

async getTasksByUser(userId: string) {

  return this.prisma.task.findMany({
    take: 50,
    where: {
      assignedToId: userId,
      isDeleted: false
    },

    include: {

      project: {
        select: {
          id: true,
          name: true
        }
      },

      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },

      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }

    },

    orderBy: {
      createdAt: 'desc'
    }

  })

}
async reassignTask(
  taskId: string,
  assignedToId: string,
  userId: string,
  role: string,
) {

  const task = await this.prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  if (task.isLocked) {
    throw new ForbiddenException('Task is locked')
  }
const memberLink = await this.prisma.projectMember.findFirst({
  where: {
    projectId: task.projectId!,
    userId: assignedToId
  }
})

if (!memberLink) {
  throw new BadRequestException(
    "User is not part of this project"
  )
}
  const updatedTask = await this.prisma.task.update({
    where: { id: taskId },
    data: {
      assignedToId
    }
  })

  // ✅ Log the reassignment
  await this.logService.createLog(
    'TASK_REASSIGNED',
    'TASK',
    taskId,
    userId,
    {
      from: task.assignedToId,
      to: assignedToId
    }
  )

  return updatedTask
}
async extendDueDate(
  taskId: string,
  newDueDate: Date,
  userId: string,
  role: string,
) {

  const task = await this.prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task)
    throw new NotFoundException('Task not found')

  if (task.isLocked)
    throw new ForbiddenException('Task is locked')

  // Check PM permission
  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId!,
      userId,
      role: 'PROJECT_MANAGER'
    }
  })

  if (!managerLink)
    throw new ForbiddenException('Only Project Manager can extend due date')

  const updatedTask = await this.prisma.task.update({
    where: { id: taskId },
    data: {
      dueDate: newDueDate
    }
  })

  // Log change
  await this.logService.createLog(
    'TASK_DUE_DATE_EXTENDED',
    'TASK',
    taskId,
    userId,
    {
      from: task.dueDate,
      to: newDueDate
    }
  )

  return updatedTask
}
async updatePriority(
  taskId: string,
  newPriority: Priority,
  userId: string,
  role: string,
) {

  const task = await this.prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task)
    throw new NotFoundException('Task not found')

  if (task.isLocked)
    throw new ForbiddenException('Task is locked')

  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId!,
      userId,
      role: 'PROJECT_MANAGER'
    }
  })

  if (!managerLink)
    throw new ForbiddenException('Only PM can change priority')

  const updatedTask = await this.prisma.task.update({
    where: { id: taskId },
    data: {
      priority: newPriority
    }
  })

  await this.logService.createLog(
    'TASK_PRIORITY_CHANGED',
    'TASK',
    taskId,
    userId,
    {
      from: task.priority,
      to: newPriority
    }
  )

  return updatedTask
}
async getTasksByProject(projectId: string, userId: string) {

  const project = await this.prisma.project.findUnique({
    where: { id: projectId }
  })

  if (!project) {
    throw new NotFoundException("Project not found")
  }

  // Check user belongs to project
  const memberLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId,
      userId
    }
  })

  if (!memberLink) {
    throw new ForbiddenException(
      "You do not belong to this project"
    )
  }

  return this.prisma.task.findMany({
take: 50,
    where: {
      projectId,
      isDeleted: false
    },

    include: {

      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },

      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }

    },

    orderBy: {
      createdAt: "desc"
    }

  })

}
async deleteTask(
  taskId: string,
  userId: string,
  role: string,
) {

  console.log("DELETE REQUEST TASK ID:", taskId)

  const task = await this.prisma.task.findUnique({
    where: { id: taskId }
  })

  if (!task) {
    throw new NotFoundException("Task not found")
  }

  if (task.status !== TaskStatus.CREATED) {
    throw new ForbiddenException(
      "Only tasks with CREATED status can be deleted"
    )
  }

  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId!,
      userId,
      role: "PROJECT_MANAGER"
    }
  })

  if (!managerLink) {
    throw new ForbiddenException(
      "Only Project Manager can delete tasks"
    )
  }

  // 🔥 SOFT DELETE
  const deletedTask = await this.prisma.task.update({
    where: { id: taskId },
    data: {
      isDeleted: true,
      deletedAt: new Date()
    }
  })

  console.log("TASK AFTER DELETE:", deletedTask)

  await this.logService.createLog(
    "TASK_DELETED",
    "TASK",
    taskId,
    userId,
    {
      title: task.title
    }
  )

  return {
    message: "Task deleted successfully",
    task: deletedTask
  }
}
async getNextTask(userId: string) {

  return this.prisma.task.findFirst({

    where: {
      assignedToId: userId,
      isDeleted: false,
      status: {
        in: ['REWORK', 'IN_PROGRESS', 'CREATED']
      }
    },

    orderBy: [
      { priority: 'desc' },
      { dueDate: 'asc' }
    ],

    include: {
      project: true
    }

  })

}
}
