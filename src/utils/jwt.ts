import { sign, verify } from 'hono/jwt';

export interface JWTPayload extends Record<string, unknown> {
  userId: number;
  email: string;
  name: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function generateToken(payload: JWTPayload, secret: string): Promise<string> {
  return await sign(payload, secret);
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload> {
  const payload = await verify(token, secret);
  return payload as JWTPayload;
}
