import { PrismaClient, User } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  profileCompleted?: boolean;
}

export interface UserService {
  createUser(userData: CreateUserInput): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
}

export class PrismaUserService implements UserService {
  private prisma: PrismaClient;

  constructor(d1Database?: D1Database) {
    this.prisma = getPrismaClient(d1Database);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    const { email, passwordHash, name, role, profileCompleted = false } = userData;
    
    return this.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        name,
        role,
        profile_completed: profileCompleted,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}

// Factory function to create a user service instance
export function createUserService(d1Database?: D1Database): UserService {
  return new PrismaUserService(d1Database);
}
