import { User } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken, JWTPayload } from '../utils/jwt';
import { createUserService, UserService } from './user-service';

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  role: 'farmer' | 'consumer';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    profileCompleted: boolean;
  };
}

export class AuthService {
  private userService: UserService;
  private jwtSecret: string;

  constructor(jwtSecret: string, d1Database?: D1Database) {
    this.userService = createUserService(d1Database);
    this.jwtSecret = jwtSecret;
  }

  async signup(input: SignupInput): Promise<AuthResponse> {
    const { email, password, name, role } = input;

    // Check if user already exists
    const existingUser = await this.userService.getUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    
    const user = await this.userService.createUser({
      email,
      passwordHash,
      name,
      role,
      profileCompleted: false,
    });

    // Generate JWT token
    return this.generateAuthResponse(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const { email, password } = input;

    // Get user by email
    const user = await this.userService.getUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    return this.generateAuthResponse(user);
  }

  private async generateAuthResponse(user: User): Promise<AuthResponse> {
    // Generate JWT token
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
    };

    const token = await generateToken(payload, this.jwtSecret);

    return {
      accessToken: token,
      expiresIn: 24 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role,
        profileCompleted: user.profile_completed,
      }
    };
  }
}

// Factory function to create an auth service instance
export function createAuthService(jwtSecret: string, d1Database?: D1Database): AuthService {
  return new AuthService(jwtSecret, d1Database);
}
