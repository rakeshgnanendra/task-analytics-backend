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
import { NotificationService } from 'src/notification/notification.service'
import { SocketGateway } from 'src/socket/socket.gateway'
@Injectable()
export class TaskService {
  [x: string]: any
 
   
  constructor(private prisma: PrismaService, private logService:LogsService,  private notificationService: NotificationService,  private socketGateway: SocketGateway ) {}

  // =============================
  // CREATE TASK
  // =============================
async createTask(
  projectId: string | null,
  departmentId: string | null,
  creatorId: string,
  creatorRole: string,
  title: string,
  description: string,
  assignedToId: string,
  dueDate: Date,
  priority: Priority,
  files?: Express.Multer.File[],
) {

  // ❌ Validation: both missing
  if (!projectId && !departmentId) {
    throw new BadRequestException('Project or Department is required')
  }

  // ❌ Validation: both present
  if (projectId && departmentId) {
    throw new BadRequestException('Task cannot belong to both project and department')
  }

  let taskData: any = {
    title,
    description,
    createdById: creatorId,
    assignedToId,
    dueDate,
    priority,
    status: TaskStatus.CREATED,
  }

  // =========================
  // 🔵 PROJECT FLOW
  // =========================
  if (projectId) {

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

    taskData.projectId = projectId
  }

  // =========================
  // 🟢 DEPARTMENT FLOW
  // =========================
  
  if (departmentId) {

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    })

    if (!department) {
      throw new NotFoundException('Department not found')
    }

    if (creatorRole !== 'DELIVERY_HEAD') {
      throw new ForbiddenException(
        'Only Delivery Head can create tasks for departments',
      )
    }

    const user = await this.prisma.user.findUnique({
      where: { id: assignedToId },
    })

    if (!user || user.departmentId !== departmentId) {
      throw new BadRequestException(
        'Assigned user is not part of this department',
      )
    }

    taskData.departmentId = departmentId
  }

  // =========================
  // 🎟️ GENERATE TICKET ID (FIXED)
  // =========================
  let nameForCode = title; // fallback

if (projectId) {
  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
  });

  nameForCode = project?.name || title;
}

if (departmentId) {
  const department = await this.prisma.department.findUnique({
    where: { id: departmentId },
  });

  nameForCode = department?.name || title;
}
  const ticketId = await this.generateTicketId(
    nameForCode,
    projectId || null,
    departmentId|| null,
  )

  taskData.ticketId = ticketId  // ✅ IMPORTANT FIX

  // =========================
  // 🧱 CREATE TASK
  // =========================
  const task = await this.prisma.task.create({
    data: taskData,
  })
  // 🔥 COLLECT USERS
const usersToNotify = new Set<string>();

if (task.assignedToId) usersToNotify.add(task.assignedToId);
if (task.createdById) usersToNotify.add(task.createdById);

// ✅ PROJECT MEMBERS
if (task.projectId) {
  const project = await this.prisma.project.findUnique({
    where: { id: task.projectId },
    include: {
      members: true,
    },
  });

  project?.members.forEach((m) => {
    if (m.userId) usersToNotify.add(m.userId);
  });

  // ✅ DELIVERY HEAD
  if (project?.deliveryHeadId) {
    usersToNotify.add(project.deliveryHeadId);
  }
}
// ✅ DEPARTMENT FLOW (MISSING)
if (task.departmentId) {
  const deptUsers = await this.prisma.user.findMany({
    where: {
      departmentId: task.departmentId,
    },
    select: { id: true },
  });

  deptUsers.forEach((u) => usersToNotify.add(u.id));
}
// 🔥 REMOVE CREATOR
if (task.createdById !== task.assignedToId) {
  usersToNotify.delete(task.createdById);
}

// 🔥 SEND NOTIFICATIONS
for (const uid of usersToNotify) {
 await this.notificationService.createNotification(
  uid,
  "TASK_CREATED",
  `New task assigned: ${task.title}`,
  task.id,
  null // ✅ ADD THIS
);

  // 🔥 REAL-TIME
  this.socketGateway.sendNotification(uid, {
    type: "TASK_CREATED",
    message: `New task assigned: ${task.title}`,
    taskId: task.id,
  });
}

  // =========================
  // 📎 FILE UPLOAD
  // =========================
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

  // =========================
  // 🧾 LOGGING
  // =========================
  await this.logService.createLog(
    'TASK_CREATED',
    'TASK',
    task.id,
    assignedToId,
    {
      title: task.title,
      priority: task.priority,
      ticketId: task.ticketId, // ✅ add this (nice for logs)
      type: projectId ? 'PROJECT' : 'DEPARTMENT',
    }
  )

  // =========================
  // 📤 RESPONSE
  // =========================
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

      project: true,
      department: true,
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
  timeData?: {
    timeSpentHours?: number
    timeSpentDays?: number
  }
) {
  // ===============================
  // 1️⃣ FETCH TASK
  // ===============================
  const task = await this.prisma.task.findUnique({
    where: { id: taskId },
  })

  if (!task) throw new NotFoundException('Task not found')

  if (task.isLocked) {
    throw new ForbiddenException(
      'Task is locked and cannot be modified',
    )
  }

  // ===============================
  // 2️⃣ ROLE CHECKS
  // ===============================

  // Project Manager check (Project flow)


 let isProjectManager = false;

if (task.projectId !== null && task.projectId !== undefined) {
  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId,
      userId,
      role: ProjectRole.PROJECT_MANAGER,
    },
  });

  isProjectManager = !!managerLink;
}

  // Department Head check (Department flow)
  let isDepartmentHead = false

  if (task.departmentId) {
    const department = await this.prisma.department.findUnique({
      where: { id: task.departmentId },
    })

    // 👉 Better if you have headId
    isDepartmentHead = globalRole === 'DELIVERY_HEAD'
  }

  // Assigned User (Team Member)
  const isAssignedUser = task.assignedToId === userId

  // ===============================
  // 3️⃣ STATE MACHINE
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
  // 4️⃣ ROLE RESTRICTIONS
  // ===============================

  // 🔹 TEAM MEMBER (Assignee)
  if (isAssignedUser) {
    if (
      newStatus !== TaskStatus.IN_PROGRESS &&
      newStatus !== TaskStatus.COMPLETED
    ) {
      throw new ForbiddenException(
        'Team Member cannot perform this action',
      )
    }
  }

  // 🔹 PROJECT MANAGER (Project tasks)
  if (task.projectId && isProjectManager) {
    if (
      newStatus !== TaskStatus.CONFIRMED &&
      newStatus !== TaskStatus.REJECTED &&
      newStatus !== TaskStatus.REWORK
    ) {
      throw new ForbiddenException(
        'Project Manager cannot perform this action',
      )
    }
  }

  // 🔹 DEPARTMENT HEAD (Department tasks)
  if (task.departmentId && isDepartmentHead) {
    if (
      newStatus !== TaskStatus.CONFIRMED &&
      newStatus !== TaskStatus.REJECTED &&
      newStatus !== TaskStatus.REWORK
    ) {
      throw new ForbiddenException(
        'Department Head cannot perform this action',
      )
    }
  }

  // 🔹 SUPER ADMIN OVERRIDE
  if (globalRole === 'SUPER_ADMIN') {
    // Allow everything (no restriction)
  }

  // ===============================
  // 5️⃣ FINAL SAFETY CHECK
  // ===============================

  const isAllowed =
    isAssignedUser ||
    isProjectManager ||
    isDepartmentHead ||
    globalRole === 'SUPER_ADMIN'

  if (!isAllowed) {
    throw new ForbiddenException(
      'You are not allowed to update this task',
    )
  }

  // ===============================
  // 6️⃣ UPDATE DATA
  // ===============================
  const updateData: any = {
    status: newStatus,
  }

  if (newStatus === TaskStatus.IN_PROGRESS) {
    updateData.startedAt = new Date()
  }

  if (newStatus === TaskStatus.COMPLETED) {

  // 🚨 VALIDATION (VERY IMPORTANT)
  if (
    !timeData ||
    (!timeData.timeSpentHours && !timeData.timeSpentDays)
  ) {
    throw new BadRequestException(
      'Time spent (hours or days) is required to complete task',
    )
  }

  // ❌ Prevent both values
  if (
    timeData.timeSpentHours &&
    timeData.timeSpentDays
  ) {
    throw new BadRequestException(
      'Provide either hours OR days, not both',
    )
  }

  updateData.completedAt = new Date()

  // ✅ Save hours
  if (timeData.timeSpentHours) {
    updateData.timeSpentHours = timeData.timeSpentHours
  }

  // ✅ Save days
  if (timeData.timeSpentDays) {
    updateData.timeSpentDays = timeData.timeSpentDays
  }
}

  if (newStatus === TaskStatus.REWORK) {
    updateData.completedAt = null
  }

  if (newStatus === TaskStatus.CONFIRMED) {
    updateData.confirmedAt = new Date()
    updateData.isLocked = true
  }

  // ===============================
  // 7️⃣ UPDATE TASK
  // ===============================
 const updatedTask = await this.prisma.task.update({
  where: { id: taskId },
  data: updateData,
});

// =========================
// 🔥 NOTIFICATION LOGIC
// =========================

const usersToNotify = new Set<string>();

if (updatedTask.assignedToId) usersToNotify.add(updatedTask.assignedToId);
if (updatedTask.createdById) usersToNotify.add(updatedTask.createdById);

// PROJECT
if (updatedTask.projectId) {
  const project = await this.prisma.project.findUnique({
    where: { id: updatedTask.projectId },
    include: { members: true },
  });

  project?.members.forEach((m) => {
    if (m.userId) usersToNotify.add(m.userId);
  });

  if (project?.deliveryHeadId) {
    usersToNotify.add(project.deliveryHeadId);
  }
}

// DEPARTMENT
if (updatedTask.departmentId) {
  const deptUsers = await this.prisma.user.findMany({
    where: {
      departmentId: updatedTask.departmentId,
    },
    select: { id: true },
  });

  deptUsers.forEach((u) => usersToNotify.add(u.id));
}

// ❌ REMOVE CURRENT USER
usersToNotify.delete(userId);

// 🔥 SEND
for (const uid of usersToNotify) {
  await this.notificationService.createNotification(
    uid,
    "STATUS",
    `Task "${updatedTask.title}" updated`,
    updatedTask.id,
    null
  );

  this.socketGateway.sendNotification(uid, {
    type: "STATUS",
    message: `Task "${updatedTask.title}" updated`,
    taskId: updatedTask.id,
  });
}



  // ===============================
  // 8️⃣ LOGGING
  // ===============================
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
async addComment(taskId: string, message: string, userId: string) {
  try {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: {
            members: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!task) throw new Error("Task not found");

    if (
      task.status === "CONFIRMED" ||
      task.status === "REJECTED"
    ) {
      throw new Error("Chat is disabled for this task");
    }

    // =========================
    // ✅ CREATE COMMENT
    // =========================

    const comment = await this.prisma.taskComment.create({
      data: {
        message,
        taskId,
        userId,
        deliveredTo:[],
        seenBy:[userId],
      },
      include: {
        user: true,
      },
    });

    const senderName = comment.user?.firstName || "Someone";

    // =========================
    // 🔥 COLLECT USERS
    // =========================

    const baseUsers = new Set<string>();

    if (task.assignedToId) baseUsers.add(task.assignedToId);
    if (task.createdById) baseUsers.add(task.createdById);

    // Project DH
    if (task.project?.deliveryHeadId) {
      baseUsers.add(task.project.deliveryHeadId);
    }

    // Project members
    if (task.project?.members?.length) {
      task.project.members.forEach((m) => {
        if (m.userId) baseUsers.add(m.userId);
      });
    }

    // Department DH
    if (task.departmentId) {
      const dhUsers = await this.prisma.user.findMany({
        where: {
          departmentId: task.departmentId,
          role: "DELIVERY_HEAD",
        },
        select: { id: true },
      });

      dhUsers.forEach((u) => baseUsers.add(u.id));
    }

    // =========================
    // 🔥 MENTIONS
    // =========================

    const mentionMatches = message.match(/@(\w+)/g) || [];

    const mentionedNames = mentionMatches.map((m) =>
      m.replace("@", "").toLowerCase()
    );

    let mentionedUserIds: string[] = [];

    if (mentionedNames.includes("everyone")) {
      mentionedUserIds = Array.from(baseUsers);
    } else if (mentionedNames.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: mentionedNames.map((name) => ({
            firstName: {
              contains: name,
              mode: "insensitive",
            },
          })),
        },
        select: { id: true },
      });

      mentionedUserIds = users
        .map((u) => u.id)
        .filter((id) => baseUsers.has(id));
    }

    // =========================
    // 🔥 FINAL USERS (REMOVE SENDER)
    // =========================

    const filteredUsers = Array.from(baseUsers).filter(
      (uid) => uid && String(uid) !== String(userId)
    );

    // =========================
    // 🔥 PRELOAD EXISTING (PERFORMANCE FIX)
    // =========================

    const existingNotifications = await this.prisma.notification.findMany({
      where: {
        referenceId: comment.id,
        userId: { in: filteredUsers },
        isDeleted: false,
      },
      select: {
        userId: true,
      },
    });

    const existingUserSet = new Set(
      existingNotifications.map((n) => n.userId)
    );

    // =========================
    // 🔥 CREATE NOTIFICATIONS + SOCKET
    // =========================
const mentionedSet = new Set(mentionedUserIds);
  for (const uid of filteredUsers) {

  if (existingUserSet.has(uid)) continue;

  // 🔥 DELIVERED UPDATE
const existingComment = await this.prisma.taskComment.findUnique({
  where: { id: comment.id },
});

if (existingComment) {
  const newDelivered = filteredUsers.filter(
    (uid) => !existingComment.deliveredTo.includes(uid)
  );

  if (newDelivered.length > 0) {
    await this.prisma.taskComment.update({
      where: { id: comment.id },
      data: {
        deliveredTo: {
          push: newDelivered,
        },
      },
    });
  }
}

  if (mentionedSet.has(uid)) {
    await this.notificationService.createNotification(
      uid,
      "MENTION",
      `${senderName} mentioned you`,
      taskId,
      comment.id
    );

    this.socketGateway.sendNotification(uid, {
      type: "MENTION",
      message: `${senderName} mentioned you`,
      taskId,
      referenceId: comment.id,
    });

    continue;
  }

  await this.notificationService.createNotification(
    uid,
    "CHAT",
    `${senderName} sent a message`,
    taskId,
    comment.id
  );

  this.socketGateway.sendNotification(uid, {
    type: "CHAT",
    message: `${senderName} sent a message`,
    taskId,
    referenceId: comment.id,
  });
}
    console.log("FINAL USERS:", filteredUsers);
    console.log("SENDER:", userId);

    return comment;

  } catch (error) {
    console.error("ADD COMMENT ERROR:", error);
    throw error;
  }
}
async getComments(taskId: string, userId: string) {
  // 🔥 mark as read when opening chat
 

  return this.prisma.taskComment.findMany({
    where: { taskId },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}
private async generateTicketId(
  name: string,
  projectId: string | null,
  departmentId: string | null,
): Promise<string> {

  // 1️⃣ Prefix
  const prefix = projectId ? "P" : "D";

  // 2️⃣ Code (first 3 letters of name)
  const cleanName = name.replace(/[^a-zA-Z]/g, "");
  const code = cleanName.substring(0, 3).toUpperCase();

  // 3️⃣ Date YYYYMMDD
  const today = new Date();
  const date = today.toISOString().slice(0, 10).replace(/-/g, "");

  // 4️⃣ Start & end of day
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 5️⃣ Count today's tasks
  const count = await this.prisma.task.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      projectId: projectId || null,
      departmentId: departmentId || null,
    },
  });

  // 6️⃣ Sequence
  const sequence = String(count + 1).padStart(3, "0");

  // 7️⃣ Final Ticket ID
  return `${prefix}-${code}-${date}-${sequence}`;
}

async getTaskParticipants(taskId: string) {
  try {
    const task: any = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedTo: true,
        createdBy: true,
        project: {
          include: {
            deliveryHead: true, // ✅ IMPORTANT
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!task) throw new Error("Task not found");

    const users: any[] = [];

    // ✅ Assigned
    if (task.assignedTo) users.push(task.assignedTo);

    // ✅ Creator
    if (task.createdBy) users.push(task.createdBy);

    // ✅ Project Members (PM + TM)
    if (task.project?.members?.length) {
      task.project.members.forEach((m) => {
        if (m.user) users.push(m.user);
      });
    }

    // ✅ DELIVERY HEAD (DIRECT)
    if (task.project?.deliveryHead) {
      users.push(task.project.deliveryHead);
    }

    // =========================
    // 🔥 REMOVE DUPLICATES
    // =========================

    const uniqueUsers = Array.from(
      new Map(users.map((u) => [u.id, u])).values()
    );

    return uniqueUsers.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
    }));

  } catch (error) {
    console.error("GET PARTICIPANTS ERROR:", error);
    throw error;
  }
}
async getTaskById(id: string) {
  const task = await this.prisma.task.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      createdBy: true,
      project: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error("Task not found");
  }

  return task;
}
}
