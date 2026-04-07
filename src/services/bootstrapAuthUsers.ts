import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../middleware/auth';

type BootstrapUser = {
  username: string;
  password: string;
  fullName: string;
  role: string;
};

const DEFAULT_USERS: BootstrapUser[] = [
  {
    username: 'admin',
    password: 'admin123',
    fullName: 'Administrator',
    role: 'admin',
  },
  {
    username: 'dentist1',
    password: 'dentist123',
    fullName: 'Dentist',
    role: 'dentist',
  },
  {
    username: 'reception',
    password: 'reception123',
    fullName: 'Receptionist',
    role: 'user',
  },
];

export async function bootstrapAuthUsers(prisma: PrismaClient): Promise<void> {
  const shouldBootstrap = process.env.BOOTSTRAP_DEFAULT_USERS !== 'false';
  if (!shouldBootstrap) {
    return;
  }

  for (const user of DEFAULT_USERS) {
    const passwordHash = await hashPassword(user.password);

    await prisma.user.upsert({
      where: { username: user.username },
      // Keep existing production users unchanged; only create missing defaults.
      update: {},
      create: {
        username: user.username,
        passwordHash,
        fullName: user.fullName,
        role: user.role,
        active: true,
      },
    });
  }
}
