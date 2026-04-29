import { Injectable } from '@nestjs/common'
import { PrismaClient, TaskStatus } from '@prisma/client'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaClient) {}

  async getDashboardData(userId: string, role: string) {
    const now = new Date()

const startOfThisWeek = new Date(now)
startOfThisWeek.setDate(now.getDate() - now.getDay())

const startOfLastWeek = new Date(startOfThisWeek)
startOfLastWeek.setDate(startOfThisWeek.getDate() - 7)

const endOfLastWeek = new Date(startOfThisWeek)

    const today = new Date()

    if (role === 'SUPER_ADMIN') {
  const totalUsers = await this.prisma.user.count()
  const totalProjects = await this.prisma.project.count()
  const totalTasks = await this.prisma.task.count()
const today = new Date();
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(today.getDate() - 6);

const tasks = await this.prisma.task.findMany({
  where: {
    createdAt: {
      gte: sevenDaysAgo,
    },
  },
  select: {
    createdAt: true,
    status: true,
  },
});
const weeklyMap = new Map();

for (let i = 0; i < 7; i++) {
  const date = new Date();
  date.setDate(today.getDate() - i);

  const key = date.toISOString().split("T")[0];

  weeklyMap.set(key, {
    date: key,
    created: 0,
    completed: 0,
  });
}
tasks.forEach((task) => {
  const taskDate = task.createdAt.toISOString().split("T")[0];

  if (weeklyMap.has(taskDate)) {
    weeklyMap.get(taskDate).created += 1;

    if (task.status === 'CONFIRMED') {
      weeklyMap.get(taskDate).completed += 1;
    }
  }
});
const weeklyTrend = Array.from(weeklyMap.values()).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
);



const deliveryHeads = await this.prisma.user.findMany({
  where: { role: 'DELIVERY_HEAD' },
  include: {
    deliveryHeadProjects: {
      include: {
        tasks: true,
      },
    },
  },
});
const deliveryHeadPerformance = deliveryHeads.map((head) => {
  const allTasks = head.deliveryHeadProjects.flatMap(
    (project) => project.tasks
  );

  const totalTasks = allTasks.length;

  const completedTasks = allTasks.filter(
    (task) => task.status === 'CONFIRMED'
  ).length;

  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100);

  return {
    deliveryHeadId: head.id,
    email: head.email,
    totalTasks,
    completedTasks,
    completionRate,
  };
});

  const statusDistribution = await this.getStatusDistribution({});

  return {
    role: 'SUPER_ADMIN',
    totalUsers,
    totalProjects,
    totalTasks,
    statusDistribution,
    weeklyTrend,
    deliveryHeadPerformance

  }
}

    // 👑 DELIVERY HEAD
   // 👑 DELIVERY HEAD
if (role === 'DELIVERY_HEAD') {
    // 6️⃣ Manager Performance Ranking

const managers = await this.prisma.projectMember.findMany({
  where: {
    role: 'PROJECT_MANAGER',
  },
  select: {
    userId: true,
    projectId: true,
  },
})

const managerMap = new Map<string, string[]>()

// Group projects by manager
managers.forEach((m) => {
  if (!managerMap.has(m.userId)) {
    managerMap.set(m.userId, [])
  }
  managerMap.get(m.userId)?.push(m.projectId)
})

const managerPerformance = await Promise.all(
  Array.from(managerMap.entries()).map(async ([managerId, projectIds]) => {
    const totalTasks = await this.prisma.task.count({
      where: {
        projectId: { in: projectIds },
        isDeleted: false
      },
    })

    const confirmedTasks = await this.prisma.task.count({
      where: {
        projectId: { in: projectIds },
        status: TaskStatus.CONFIRMED,
        isDeleted: false
      },
    })
const nextFourDays = new Date()
nextFourDays.setDate(today.getDate() + 4)


    const completionRate =
      totalTasks === 0
        ? 0
        : Math.round((confirmedTasks / totalTasks) * 100)

    const user = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { email: true },
    })

    return {
      managerId,
      email: user?.email,
      confirmedTasks,
      totalTasks,
      completionRate,
    }
  }),
)

    const thisWeekCompleted = await this.prisma.task.count({
  where: {
    status: TaskStatus.CONFIRMED,
    isDeleted: false,
    updatedAt: {
      gte: startOfThisWeek,
    },
  },
})

const lastWeekCompleted = await this.prisma.task.count({
  where: {
    status: TaskStatus.CONFIRMED,
    updatedAt: {
      gte: startOfLastWeek,
      lt: endOfLastWeek,
    },
  },
})


let growthPercentage = 0;

if (lastWeekCompleted === 0) {
  growthPercentage = thisWeekCompleted === 0 ? 0 : 100;
} else {
  growthPercentage = Math.round(
    ((thisWeekCompleted - lastWeekCompleted) / lastWeekCompleted) * 100
  );
}
    const statusDistribution = await this.getStatusDistribution({})

  // 1️⃣ Total projects
const projects = await this.prisma.project.findMany({
  where: { deliveryHeadId: userId },
  include: {
    tasks: true,
    members: true,
  },
})

const totalProjects = projects.length
 const pendingConfirmation = projects.reduce(
  (sum, project) =>
    sum +
    project.tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED,
    ).length,
  0,
)

  // 2️⃣ Tasks per project
  
const overduePerProjectRaw = await this.prisma.task.groupBy({
  by: ['projectId'],
  where: {
    projectId: { not: null }, // 🔥 filter nulls
    dueDate: { lt: today },
    status: { not: TaskStatus.CONFIRMED },
  },
  _count: { id: true },
})


const overduePerProject = await Promise.all(
  overduePerProjectRaw
    .filter((item) => item.projectId !== null)
    .map(async (item) => {
      const project = await this.prisma.project.findUnique({
        where: { id: item.projectId! }, // ✅ safe now
        select: { name: true },
      })

      return {
        projectId: item.projectId!,
        projectName: project?.name,
        overdueTasks: item._count.id,
      }
    }),
)

  // 3️⃣ Completion rate
 const totalTasks = projects.reduce(
  (sum, project) => sum + project.tasks.length,
  0,
)

 const completedTasks = projects.reduce(
  (sum, project) =>
    sum +
    project.tasks.filter(
      (t) => t.status === TaskStatus.CONFIRMED,
    ).length,
  0,
)
const nextFourDays = new Date()
nextFourDays.setDate(today.getDate() + 4)
const upcomingDeadlines = projects.reduce(
  (sum, project) =>
    sum +
    project.tasks.filter(
      (t) =>
        t.status !== TaskStatus.CONFIRMED &&
        t.dueDate &&
        new Date(t.dueDate) >= today &&
        new Date(t.dueDate) <= nextFourDays,
    ).length,
  0,
)


  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100)
      const projectsOverview = projects.map((project) => {
        const reworkTasks = project.tasks.filter(
  (t) => t.status === TaskStatus.REWORK,
).length
  const totalTasks = project.tasks.length

  const completedTasks = project.tasks.filter(
    (t) => t.status === TaskStatus.CONFIRMED,
  ).length

  const inProgressTasks = project.tasks.filter(
    (t) => t.status === TaskStatus.IN_PROGRESS,
  ).length

  const createdTasks = project.tasks.filter(
    (t) => t.status === TaskStatus.CREATED,
  ).length

  const overdueTasks = project.tasks.filter(
    (t) =>
      t.status !== TaskStatus.CONFIRMED &&
      t.dueDate &&
      new Date(t.dueDate) < today,
  ).length

  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100)

  let riskLevel = 'LOW'
  if (overdueTasks > 3) riskLevel = 'HIGH'
  else if (overdueTasks > 0) riskLevel = 'MEDIUM'

  const managerCount = project.members.filter(
    (m) => m.role === 'PROJECT_MANAGER',
  ).length

  return {
    projectId: project.id,
    projectName: project.name,
    status: project.status,
    totalTasks,
    completedTasks,
    inProgressTasks,
    createdTasks,
    reworkTasks,
    overdueTasks,
    pendingConfirmation,
    upcomingDeadlines,
    completionRate,
    riskLevel,
    managerCount,
  }
})
const highRiskProjects = projectsOverview.filter(
  (p) => p.riskLevel === 'HIGH',
).length
  // 4️⃣ Overdue tasks
  const overdue = projects.reduce(
  (sum, project) =>
    sum +
    project.tasks.filter(
      (t) =>
        t.status !== TaskStatus.CONFIRMED &&
        t.dueDate &&
        new Date(t.dueDate) < today,
    ).length,
  0,
)

  // 5️⃣ Top performers
  const topPerformers = await this.prisma.task.groupBy({
    by: ['assignedToId'],
    where: { status: TaskStatus.CONFIRMED },
    _count: { id: true },
    orderBy: {
      _count: { id: 'desc' },
    },
    take: 5,
  })

  const performerDetails = await Promise.all(
    topPerformers.map(async (p) => {
      const user = await this.prisma.user.findUnique({
        where: { id: p.assignedToId },
        select: { email: true },
      })

      return {
        userId: p.assignedToId,
        email: user?.email,
        completedTasks: p._count.id,
      }
    }),
  )

  // ✅ IMPORTANT: RETURN HERE
 return {
  role: 'DELIVERY_HEAD',
  totalProjects,
  totalTasks,
  completionRate,
  overdue,
  highRiskProjects,
  projectsOverview,
  statusDistribution,
  weeklyTrend: {
    thisWeek: thisWeekCompleted,
    lastWeek: lastWeekCompleted,
    growthPercentage,
    managerPerformance,
  },
}
}


    // 👔 PROJECT MANAGER
    const managerProjects = await this.prisma.projectMember.findMany({
      where: {
        userId,
        role: 'PROJECT_MANAGER',
        
      },
      
      select: { projectId: true },
    })

    const projectIds = managerProjects.map(p => p.projectId)
const statusDistribution = await this.getStatusDistribution({
  projectId: { in: projectIds },
  isDeleted: false,
})

    if (projectIds.length > 0) {
      const totalTasks = await this.prisma.task.count({
        where: { projectId: { in: projectIds } , isDeleted: false},
      })

      const completed = await this.prisma.task.count({
        where: {
          projectId: { in: projectIds },
          status: TaskStatus.CONFIRMED,
          isDeleted: false
        },
      })

      const awaitingConfirmation = await this.prisma.task.count({
        where: {
          projectId: { in: projectIds },
          status: TaskStatus.COMPLETED,
          isDeleted: false
        },
      })
const overduePerProject = await this.prisma.task.groupBy({
  by: ['projectId'],
  where: {
    projectId: { in: projectIds },
    dueDate: { lt: today },
    status: { not: TaskStatus.CONFIRMED },
    isDeleted: false
  },
  _count: { id: true },
})

      return {
        role: 'PROJECT_MANAGER',
        totalTasks,
        completed,
        awaitingConfirmation,
        statusDistribution,
        overduePerProject
      }
    }

    // 👨‍💻 TEAM MEMBER
    const assignedTasks = await this.prisma.task.count({
      where: { assignedToId: userId , isDeleted: false },
      
    })

   const completed = await this.prisma.task.count({
  where: {
    assignedToId: userId,
    status: {
      in: [TaskStatus.COMPLETED, TaskStatus.CONFIRMED],
    },
    isDeleted: false,
  },
})
    const inProgress = await this.prisma.task.count({
  where: {
    assignedToId: userId,
    status: TaskStatus.IN_PROGRESS,
    isDeleted: false
  },
})

    const overdue = await this.prisma.task.count({
  where: {
    assignedToId: userId,
    dueDate: { lt: today },
    status: { not: TaskStatus.CONFIRMED },
    isDeleted: false
  },
})
 const statusDistribut = await this.getStatusDistribution({
  assignedToId: userId,
  isDeleted: false
})


    return {
      role: 'TEAM_MEMBER',
      assignedTasks,
      completed,
      inProgress,
      overdue,
      statusDistribut
    }
  }
  private async getStatusDistribution(whereClause: any) {
  const distribution = await this.prisma.task.groupBy({
    by: ['status'],
    where: whereClause,
    _count: {
      status: true,
    },
  })

  // Convert array → object format
  const result = {
    CREATED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    REWORK:0,
    CONFIRMED: 0,
    REJECTED: 0,
  }

  distribution.forEach((item) => {
    result[item.status] = item._count.status
  })

  return result
}
async getTeamWorkload(userId: string) {

  const tasks = await this.prisma.task.findMany({
    where: {
      project: {
        members: {
          some: {
            userId,
            role: "PROJECT_MANAGER"
          }
        }
      }
    },
    include: {
      assignedTo: true
    }
  });

  const workload = {};

  tasks.forEach((task) => {

    if (!task.assignedTo) return;

    const id = task.assignedTo.id;

    if (!workload[id]) {
      workload[id] = {
        userId: id,
        name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
        totalTasks: 0,
        completed: 0,
        inProgress: 0
      };
    }

    workload[id].totalTasks++;

    if (task.status === "CONFIRMED")
      workload[id].completed++;

    if (task.status === "IN_PROGRESS")
      workload[id].inProgress++;

  });

  return Object.values(workload);
}
async getUpcomingDeadlines(userId: string) {

  const today = new Date()

  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)

  return this.prisma.task.findMany({
    where: {
      dueDate: {
        gte: today,
        lte: nextWeek
      },
      project: {
        members: {
          some: {
            userId,
            role: "PROJECT_MANAGER"
          }
        }
      }
    },
    include: {
      project: true,
      assignedTo: true
    },
    orderBy: {
      dueDate: "asc"
    }
  })
}
async getDepartmentStats() {

  const departments = await this.prisma.department.findMany({
    include: {
      tasks: {
        where: { isDeleted: false }
      }
    }
  });

  return departments.map(dep => {

    const total = dep.tasks.length;

    const completed = dep.tasks.filter(
      t => t.status === 'CONFIRMED'
    ).length;

    const overdue = dep.tasks.filter(
      t =>
        new Date(t.dueDate) < new Date() &&
        t.status !== 'CONFIRMED'
    ).length;

    return {
      id: dep.id,
      name: dep.name,
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
    };
  });
}
}
