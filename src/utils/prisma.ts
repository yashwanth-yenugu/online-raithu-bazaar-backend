import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

// Global variable to store the Prisma client instance
let prisma: PrismaClient | undefined;

// Function to get or create the Prisma client
export function getPrismaClient(d1Database?: D1Database): PrismaClient {
  // If we already have a Prisma client instance, return it
  if (prisma) {
    return prisma;
  }

  // Create a new Prisma client with D1 adapter if D1Database is provided
  if (d1Database) {
    const adapter = new PrismaD1(d1Database);
    prisma = new PrismaClient({ 
      adapter,
      log: ['query', 'error', 'warn'],
    });
  } else {
    // Create a standard Prisma client for local development
    prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }

  return prisma;
}

// Function to disconnect the Prisma client
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

// Function to get a new Prisma client instance (for testing purposes)
export function getNewPrismaClient(d1Database?: D1Database): PrismaClient {
  if (d1Database) {
    const adapter = new PrismaD1(d1Database);
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
} 