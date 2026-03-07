import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaClient, GlobalRole, ProjectRole } from '@prisma/client'

@Injectable()
export class ProjectService {
  
  constructor(private prisma: PrismaClient) {}

  async createProject(name: string, description?: string, userId?: string,
  role?: string) {

     if (role !== 'DELIVERY_HEAD') {
    throw new ForbiddenException(
      'Only Delivery Head can create project',
    )
  }
    return this.prisma.project.create({
      data: {
        name,
        description,
        deliveryHeadId: userId,
      },
    })
  }
async getProjectById(projectId: string) {
  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
    include: {
      deliveryHead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      tasks: {
        where: {
          isDeleted: false
        }
      },
    },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  return project;
}
async getProjects(userId: string, role: string) {

  // DELIVERY HEAD → see all projects under them
  if (role === 'DELIVERY_HEAD') {
    return this.getAllProjects();
  }

  // PROJECT MANAGER → projects where user is PM
  if (role === 'EMPLOYEE') {

    const projects = await this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId: userId,
            role: 'PROJECT_MANAGER'
          }
        }
      },
      include: {
        deliveryHead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        members: true,

        // 🔥 FIX: exclude deleted tasks
        tasks: {
          where: {
            isDeleted: false
          }
        }
      }
    });

    return projects.map((project) => {

      const totalTasks = project.tasks.length;

      const completedTasks = project.tasks.filter(
        (t) => t.status === 'CONFIRMED'
      ).length;

      const overdueTasks = project.tasks.filter(
        (t) =>
          new Date(t.dueDate) < new Date() &&
          t.status !== 'CONFIRMED'
      ).length;

      const completionRate =
        totalTasks === 0
          ? 0
          : Math.round((completedTasks / totalTasks) * 100);

      let riskLevel = 'LOW';

      if (overdueTasks > 3) riskLevel = 'HIGH';
      else if (overdueTasks > 0) riskLevel = 'MEDIUM';

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        deliveryHead: project.deliveryHead,

        managerCount: project.members.filter(
          (m) => m.role === 'PROJECT_MANAGER'
        ).length,

        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate,
        riskLevel
      };
    });
  }

  return [];
}
  getAllProjects() {
    throw new Error('Method not implemented.');
  }

  // 🔥 ADD MEMBER METHOD
  async addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole,
  requesterRole: string,
) {
  const project = await this.prisma.project.findUnique({
  where: { id: projectId },
})

if (!project) {
  throw new NotFoundException('Project not found')
}

if (project.status === 'INACTIVE') {
  throw new BadRequestException('Cannot modify inactive project')
}
  // DELIVERY_HEAD cannot assign PM
  if (
    requesterRole === 'DELIVERY_HEAD' &&
    role === 'PROJECT_MANAGER'
  ) {
    throw new ForbiddenException(
      'Only Super Admin can assign Project Manager',
    )
  }

  const alreadyExists =
    await this.prisma.projectMember.findFirst({
      where: { projectId, userId },
    })

  if (alreadyExists) {
    throw new BadRequestException(
      'User already assigned to project',
    )
  }

  // If assigning PM → demote old PM
  if (role === 'PROJECT_MANAGER') {
    const existingPM =
      await this.prisma.projectMember.findFirst({
        where: {
          projectId,
          role: 'PROJECT_MANAGER',
        },
      })

    if (existingPM) {
      await this.prisma.projectMember.update({
        where: { id: existingPM.id },
        data: { role: 'TEAM_MEMBER' },
      })
    }
  }

  return this.prisma.projectMember.create({
    data: {
      projectId,
      userId,
      role,
    },
  })
}
  async updateProject(
  projectId: string,
  userId: string,
  role: string,
  data: any,
) {
  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    throw new NotFoundException('Project not found')
  }

  // Delivery head can update any project
  if (role === 'DELIVERY_HEAD') {
    return this.prisma.project.update({
      where: { id: projectId },
      data,
    })
  }

  // Project manager validation
  const managerLink = await this.prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      role: 'PROJECT_MANAGER',
    },
  })

  if (!managerLink) {
    throw new ForbiddenException(
      'Only Project Manager can update this project',
    )
  }

  return this.prisma.project.update({
    where: { id: projectId },
    data,
  })
}
async deleteProject(projectId: string, role: string) {
  if (role !== 'DELIVERY_HEAD') {
    throw new ForbiddenException(
      'Only Delivery Head can delete project',
    )
  }

  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true },
  })

  if (!project) {
    throw new NotFoundException('Project not found')
  }

  // 🔥 ENTERPRISE SAFETY RULE
  if (project.tasks.length > 0) {
    throw new BadRequestException(
      'Cannot delete project with tasks. Deactivate instead.',
    )
  }

  return this.prisma.project.delete({
    where: { id: projectId },
  })
}
async toggleProjectStatus(
  projectId: string,
  role: string,
) {
  // Only DELIVERY_HEAD can toggle
  if (role !== 'DELIVERY_HEAD') {
    throw new ForbiddenException(
      'Only Delivery Head can change project status',
    )
  }

  const project = await this.prisma.project.findUnique({
    where: { id: projectId },
  })

  if (!project) {
    throw new NotFoundException('Project not found')
  }

  const newStatus =
    project.status === 'ACTIVE'
      ? 'INACTIVE'
      : 'ACTIVE'

  return this.prisma.project.update({
    where: { id: projectId },
    data: { status: newStatus },
  })
}

async removeMember(
  projectId: string,
  userId: string,
  requesterRole: string,
) {
  // Permission check
  if (
    requesterRole !== 'SUPER_ADMIN' &&
    requesterRole !== 'DELIVERY_HEAD'
  ) {
    throw new ForbiddenException(
      'Not allowed to remove members',
    );
  }

  // Check membership exists
  const existing = await this.prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
    },
  });

  if (!existing) {
    throw new BadRequestException(
      'User is not part of this project',
    );
  }

  // Optional: prevent removing Project Manager directly
  if (existing.role === 'PROJECT_MANAGER') {
    throw new BadRequestException(
      'Remove or change Project Manager properly',
    );
  }

  return this.prisma.projectMember.delete({
    where: {
      id: existing.id,
    },
  });
}
async removeProjectMember(
  projectId: string,
  userId: string,
  requesterRole: string,
) {
  const existing = await this.prisma.projectMember.findFirst({
    where: { projectId, userId },
  });

  if (!existing) {
    throw new BadRequestException(
      'User is not part of this project',
    );
  }

  // Only SUPER_ADMIN & DELIVERY_HEAD can remove
  if (
    requesterRole !== GlobalRole.SUPER_ADMIN &&
    requesterRole !== GlobalRole.DELIVERY_HEAD
  ) {
    throw new ForbiddenException(
      'Not allowed to remove members',
    );
  }

  // Prevent removing PM directly
  if (existing.role === ProjectRole.PROJECT_MANAGER) {
    throw new BadRequestException(
      'Assign a new Project Manager before removing current one'
    );
  }

  return this.prisma.projectMember.delete({
    where: { id: existing.id },
  });
}
async getOverdueTasks() {
  return this.prisma.task.findMany({
    where: {
      dueDate: { lt: new Date() },
      status: {
        notIn: ['CONFIRMED', 'COMPLETED'],
      },
      isDeleted: false,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      dueDate: 'asc',
    },
  });
}
async getPendingConfirmationTasks() {
  return this.prisma.task.findMany({
    where: {
      status: 'COMPLETED',
      confirmedAt: null,
      isDeleted: false,
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { completedAt: 'desc' },
  });
}
async getHighRiskProjects() {
  const projects = await this.prisma.project.findMany({
    include: {
      tasks: true,
      deliveryHead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const now = new Date();

  return projects
    .map(project => {
      const totalTasks = project.tasks.length;

      const overdueTasks = project.tasks.filter(
        t =>
          t.dueDate &&
          t.dueDate < now &&
          !['CONFIRMED'].includes(t.status)
      ).length;
const overdueRatio =
  totalTasks === 0 ? 0 : overdueTasks / totalTasks;

let riskLevel = "LOW";

if (overdueRatio >= 0.4) {
  riskLevel = "HIGH";
} else if (overdueRatio > 0) {
  riskLevel = "MEDIUM";
}
      

      return {
        id: project.id,
        name: project.name,
        totalTasks,
        overdueTasks,
        riskLevel,
        deliveryHead: project.deliveryHead,
      };
    })
    .filter(p => p.riskLevel === 'HIGH');
}
async getTeam(userId: string) {

  const projects = await this.prisma.project.findMany({
    where: {
      members: {
        some: {
          userId,
          role: 'PROJECT_MANAGER'
        }
      }
    },
  include: {
  members: {
    include: {
      user: {
        include: {
          assignedTasks: {
            where: {
              isDeleted: false
            },
            select: {
              id: true
            }
          }
        }
      }
    }
  }
}
  })

  const members = projects.flatMap(p => p.members)

  const uniqueMembers = new Map()

  members.forEach(m => {
  if (m.role !== 'PROJECT_MANAGER') {

    const user = m.user

    uniqueMembers.set(user.id, {
      ...user,
      taskCount: user.assignedTasks.length
    })

  }
})

 return Array.from(uniqueMembers.values())
}
}
