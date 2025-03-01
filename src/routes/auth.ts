import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createAuthService } from '../services/auth-service';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['farmer', 'consumer'])
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

const auth = new Hono<{ Bindings: Bindings }>();

auth.post('/sign-up', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, role } = signupSchema.parse(body);

    const authService = createAuthService(c.env.JWT_SECRET, c.env.DB);
    
    try {
      const result = await authService.signup({ email, password, name, role });
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'User already exists') {
        return c.json({ error: { message: 'User already exists' } }, 409);
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ error: { message: 'Invalid input', cause: error.issues } }, 400);
    }
    if (error instanceof HTTPException) {
      return c.json({ error: { message: error.message } }, error.status);
    }
    console.error('Sign-up error:', error);
    return c.json({ error: { message: 'An unknown error occurred' } }, 500);
  }
});

auth.post('/log-in', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = loginSchema.parse(body);

    const authService = createAuthService(c.env.JWT_SECRET, c.env.DB);
    
    try {
      const result = await authService.login({ email, password });
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid email or password') {
        return c.json({ error: { message: 'Invalid email or password' } }, 401);
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ error: { message: 'Invalid input', cause: error.issues } }, 400);
    }
    if (error instanceof HTTPException) {
      return c.json({ error: { message: error.message } }, error.status);
    }
    console.error('Login error:', error);
    return c.json({ error: { message: 'An unknown error occurred' } }, 500);
  }
});

export default auth;
