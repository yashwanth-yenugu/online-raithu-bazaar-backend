# Online Raithu Bazaar: Implementation Guide

This guide provides step-by-step instructions for implementing the Online Raithu Bazaar backend using Cloudflare's stack with Hono framework.

## Project Setup

### 5. Project Structure

Create the following directory structure:

```
online-raithu-bazaar/
├── src/
│   ├── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── error-handler.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── farmers.ts
│   │   ├── products.ts
│   │   ├── orders.ts
│   │   └── translations.ts
│   ├── services/
│   │   ├── auth-service.ts
│   │   ├── user-service.ts
│   │   ├── farmer-service.ts
│   │   ├── product-service.ts
│   │   └── order-service.ts
│   ├── utils/
│   │   ├── password.ts
│   │   ├── jwt.ts
│   │   └── validation.ts
│   └── durable-objects/
│       └── order-processor.ts
├── public/
│   └── images/
├── schema.sql
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

### 6. Base Application Setup

Create the main application file (`src/index.ts`):

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { farmersRouter } from './routes/farmers';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { translationsRouter } from './routes/translations';

// Define environment bindings type
type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  TRANSLATIONS: KVNamespace;
  ORDER_PROCESSOR: Queue;
  NOTIFICATION_PROCESSOR: Queue;
  JWT_SECRET: string;
  ORDER_PROCESSOR_DO: DurableObjectNamespace;
};

// Create Hono app instance
const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', cors());
app.use('*', logger());
app.use('*', prettyJSON());

// Public routes
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/translations', translationsRouter);

// Protected routes
app.use('/api/v1/*', async (c, next) => {
  const publicPaths = [
    '/api/v1/products',
    '/api/v1/products/search',
    '/api/v1/categories',
  ];
  
  if (publicPaths.includes(c.req.path)) {
    return next();
  }
  
  return jwt({
    secret: c.env.JWT_SECRET,
  })(c, next);
});

app.route('/api/v1/users', usersRouter);
app.route('/api/v1/farmers', farmersRouter);
app.route('/api/v1/products', productsRouter);
app.route('/api/v1/orders', ordersRouter);

// Error handling
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({
    error: {
      message: err.message,
      code: err instanceof Error ? err.name : 'UnknownError'
    }
  }, 500);
});

export default app;
```

### 6. Types Setup

Create base types (`src/types/index.ts`):

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'farmer' | 'consumer';
  profileCompleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FarmerProfile {
  id: string;
  userId: string;
  farmerName: string;
  farmName: string;
  village: string;
  district: string;
  state: string;
  pincode?: string;
  contactNumber?: string;
  description?: string;
  profilePictureKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  id: string;
  farmerId: string;
  name: {
    english: string;
    telugu: string;
  };
  description?: {
    english: string;
    telugu: string;
  };
  category: string;
  price: number;
  unit: string;
  quantity: number;
  imageKeys: string[];
  harvestedDate?: number;
  availableFrom: number;
  availableTo: number;
  createdAt: number;
  updatedAt: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  consumerId: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  status: OrderStatus;
  deliveryAddress: Address;
  contactNumber: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: {
    english: string;
    telugu: string;
  };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: number;
}

export interface Address {
  addressLine1: string;
  addressLine2?: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'completed' | 'failed';
```

## Database Setup

### 1. Create D1 Database

First, create a new D1 database using Wrangler:

```bash
# Create the database
wrangler d1 create raithu_bazaar

# The command will output something like:
# Created database 'raithu_bazaar' with id: <your-database-id>
# Update your wrangler.toml with:
# [[d1_databases]]
# binding = "DB"
# database_name = "raithu_bazaar"
# database_id = "<your-database-id>"
```

### 2. Database Schema

Create `schema.sql` file with the following schema:

```sql
-- Users table (both farmers and consumers)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('farmer', 'consumer')),
  profile_completed BOOLEAN DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Farmer profiles
CREATE TABLE farmer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  farmer_name TEXT NOT NULL,
  farm_name TEXT NOT NULL,
  village TEXT NOT NULL,
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT,
  contact_number TEXT,
  description TEXT,
  profile_picture_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Products
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL REFERENCES users(id),
  name_english TEXT NOT NULL,
  name_telugu TEXT NOT NULL,
  description_english TEXT,
  description_telugu TEXT,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  unit TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  harvested_date INTEGER,
  available_from INTEGER NOT NULL,
  available_to INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Product images
CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  image_key TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name_english TEXT NOT NULL,
  name_telugu TEXT NOT NULL,
  image_key TEXT,
  created_at INTEGER NOT NULL
);

-- Orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  consumer_id TEXT NOT NULL REFERENCES users(id),
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  village TEXT NOT NULL,
  district TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Order items
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name_english TEXT NOT NULL,
  product_name_telugu TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  created_at INTEGER NOT NULL
);

-- User preferences
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  language TEXT NOT NULL DEFAULT 'english',
  product_names_display TEXT NOT NULL DEFAULT 'both',
  order_updates_notifications BOOLEAN DEFAULT 1,
  new_products_notifications BOOLEAN DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_products_farmer_id ON products(farmer_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_orders_consumer_id ON orders(consumer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_farmer_profiles_location ON farmer_profiles(village, district);
```

### 3. Apply Database Schema

Apply the schema to your D1 database:

```bash
wrangler d1 execute raithu_bazaar --file=./schema.sql
```

### 4. Database Service Setup

Create a database service utility (`src/services/db-service.ts`):

```typescript
import { D1Database } from '@cloudflare/workers-types';

export class DatabaseService {
  constructor(private db: D1Database) {}

  // Generic query method with parameter binding
  async query<T>(
    sql: string,
    params: any[] = []
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.all();
    return result.results as T[];
  }

  // Get single row
  async queryOne<T>(
    sql: string,
    params: any[] = []
  ): Promise<T | null> {
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.first();
    return result as T || null;
  }

  // Execute insert/update/delete
  async execute(
    sql: string,
    params: any[] = []
  ): Promise<D1Result> {
    const stmt = this.db.prepare(sql).bind(...params);
    return await stmt.run();
  }

  // Transaction helper
  async transaction<T>(
    callback: (tx: D1Database) => Promise<T>
  ): Promise<T> {
    return await this.db.batch([]);
  }

  // Generate UUID
  generateId(): string {
    return crypto.randomUUID();
  }

  // Get current timestamp
  getCurrentTimestamp(): number {
    return Date.now();
  }
}

// Helper type for database results
export interface D1Result {
  success: boolean;
  error?: string;
  changes?: number;
  lastRowId?: number;
}
```

### 5. Initialize Database Service

Update the main application file (`src/index.ts`) to include the database service:

```typescript
import { DatabaseService } from './services/db-service';

// ... existing imports ...

// Create Hono app instance with database service
const app = new Hono<{
  Bindings: Bindings;
  Variables: {
    db: DatabaseService;
  };
}>();

// Add database service to context
app.use('*', async (c, next) => {
  c.set('db', new DatabaseService(c.env.DB));
  await next();
});

// ... rest of the code ...
```

### 6. Database Utilities

Create database utility functions (`src/utils/db-utils.ts`):

```typescript
export function buildWhereClause(
  conditions: Record<string, any>,
  operator: 'AND' | 'OR' = 'AND'
): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  Object.entries(conditions).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      clauses.push(`${key} = ?`);
      params.push(value);
    }
  });

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(` ${operator} `)}` : '',
    params
  };
}

export function buildPaginationClause(
  page: number = 1,
  limit: number = 10,
  orderBy?: string,
  order: 'ASC' | 'DESC' = 'DESC'
): { sql: string; offset: number } {
  const offset = (page - 1) * limit;
  const orderClause = orderBy ? `ORDER BY ${orderBy} ${order}` : '';
  return {
    sql: `${orderClause} LIMIT ? OFFSET ?`,
    offset
  };
}

export function buildUpdateClause(
  updates: Record<string, any>
): { sql: string; params: any[] } {
  const setClauses: string[] = [];
  const params: any[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  });

  return {
    sql: setClauses.join(', '),
    params
  };
}
```

## Authentication Implementation

### 1. Password Utilities

Create password utility functions (`src/utils/password.ts`):

```typescript
import * as bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

### 2. JWT Utilities

Create JWT utility functions (`src/utils/jwt.ts`):

```typescript
import { sign, verify } from 'hono/jwt';

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function generateToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return await sign({
    ...payload,
    iat,
    exp: iat + expiresIn
  }, secret);
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<JWTPayload> {
  return await verify(token, secret) as JWTPayload;
}
```

### 3. Authentication Middleware

Create authentication middleware (`src/middleware/auth.ts`):

```typescript
import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verify } from 'hono/jwt';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch (error) {
    throw new HTTPException(401, { message: 'Invalid token' });
  }
}

export function roleGuard(...roles: string[]) {
  return async function(c: Context, next: Next) {
    const user = c.get('user');
    
    if (!user || !roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    
    await next();
  };
}
```

### 4. Authentication Service

Create authentication service (`src/services/auth-service.ts`):

```typescript
import { DatabaseService } from './db-service';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateToken, JWTPayload } from '../utils/jwt';
import { User } from '../types';

export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwtSecret: string
  ) {}

  async register(
    email: string,
    password: string,
    name: string,
    role: 'farmer' | 'consumer'
  ): Promise<{ user: User; token: string }> {
    // Check if user exists
    const existingUser = await this.db.queryOne<User>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      throw new Error('Email already in use');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = this.db.generateId();
    const now = this.db.getCurrentTimestamp();

    await this.db.execute(
      `INSERT INTO users (
        id, email, password_hash, name, role, profile_completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, name, role, 0, now, now]
    );

    const user = {
      id: userId,
      email,
      name,
      role,
      profileCompleted: false,
      createdAt: now,
      updatedAt: now
    };

    // Generate token
    const token = await generateToken(
      {
        sub: userId,
        email,
        role
      },
      this.jwtSecret
    );

    return { user, token };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: User; token: string }> {
    // Get user
    const user = await this.db.queryOne<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      role: string;
      profile_completed: number;
      created_at: number;
      updated_at: number;
    }>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = await generateToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      this.jwtSecret
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as 'farmer' | 'consumer',
        profileCompleted: Boolean(user.profile_completed),
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token
    };
  }
}
```

### 5. Authentication Routes

Create authentication routes (`src/routes/auth.ts`):

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthService } from '../services/auth-service';
import { zValidator } from '@hono/zod-validator';

const router = new Hono();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['farmer', 'consumer'])
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Register endpoint
router.post(
  '/sign-up',
  zValidator('json', registerSchema),
  async (c) => {
    const { email, password, name, role } = c.req.valid('json');
    
    const authService = new AuthService(
      c.get('db'),
      c.env.JWT_SECRET
    );

    try {
      const { user, token } = await authService.register(
        email,
        password,
        name,
        role
      );

      return c.json({
        accessToken: token,
        expiresIn: 3600,
        user
      });
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

// Login endpoint
router.post(
  '/log-in',
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password } = c.req.valid('json');
    
    const authService = new AuthService(
      c.get('db'),
      c.env.JWT_SECRET
    );

    try {
      const { user, token } = await authService.login(email, password);

      return c.json({
        accessToken: token,
        expiresIn: 3600,
        user
      });
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 401);
      }
      throw error;
    }
  }
);

// Logout endpoint
router.post('/logout', async (c) => {
  // In a stateless JWT system, the client simply discards the token
  return c.json({
    success: true,
    message: 'Successfully logged out'
  });
});

export { router as authRouter };
```

### 6. Update Dependencies

Add Zod for request validation:

```bash
npm install zod @hono/zod-validator
```

### 7. Testing Authentication

You can test the authentication endpoints using cURL or Postman:

```bash
# Register a new user
curl -X POST http://localhost:8787/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "farmer@example.com",
    "password": "password123",
    "name": "John Farmer",
    "role": "farmer"
  }'

# Login
curl -X POST http://localhost:8787/api/v1/auth/log-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "farmer@example.com",
    "password": "password123"
  }'

# Access protected endpoint with token
curl -X GET http://localhost:8787/api/v1/users/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Farmer Profile APIs

### 1. Farmer Service

Create the farmer service (`src/services/farmer-service.ts`):

```typescript
import { DatabaseService } from './db-service';
import { FarmerProfile, User } from '../types';
import { buildUpdateClause, buildWhereClause } from '../utils/db-utils';

export class FarmerService {
  constructor(
    private db: DatabaseService,
    private imagesBucket: R2Bucket
  ) {}

  async createProfile(
    userId: string,
    data: {
      farmerName: string;
      farmName: string;
      village: string;
      district: string;
      state: string;
      pincode?: string;
      contactNumber?: string;
      description?: string;
      profilePicture?: File;
    }
  ): Promise<FarmerProfile> {
    // Check if profile exists
    const existingProfile = await this.db.queryOne<FarmerProfile>(
      'SELECT * FROM farmer_profiles WHERE user_id = ?',
      [userId]
    );

    if (existingProfile) {
      throw new Error('Farmer profile already exists');
    }

    // Upload profile picture if provided
    let profilePictureKey: string | undefined;
    if (data.profilePicture) {
      profilePictureKey = await this.uploadProfilePicture(
        userId,
        data.profilePicture
      );
    }

    // Create profile
    const profileId = this.db.generateId();
    const now = this.db.getCurrentTimestamp();

    await this.db.execute(
      `INSERT INTO farmer_profiles (
        id, user_id, farmer_name, farm_name, village, district, state,
        pincode, contact_number, description, profile_picture_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        userId,
        data.farmerName,
        data.farmName,
        data.village,
        data.district,
        data.state,
        data.pincode,
        data.contactNumber,
        data.description,
        profilePictureKey,
        now,
        now
      ]
    );

    // Update user profile completion status
    await this.db.execute(
      'UPDATE users SET profile_completed = 1, updated_at = ? WHERE id = ?',
      [now, userId]
    );

    return {
      id: profileId,
      userId,
      farmerName: data.farmerName,
      farmName: data.farmName,
      village: data.village,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      contactNumber: data.contactNumber,
      description: data.description,
      profilePictureKey,
      createdAt: now,
      updatedAt: now
    };
  }

  async updateProfile(
    userId: string,
    data: Partial<{
      farmerName: string;
      farmName: string;
      village: string;
      district: string;
      state: string;
      pincode: string;
      contactNumber: string;
      description: string;
      profilePicture: File;
    }>
  ): Promise<FarmerProfile> {
    // Get existing profile
    const profile = await this.db.queryOne<FarmerProfile>(
      'SELECT * FROM farmer_profiles WHERE user_id = ?',
      [userId]
    );

    if (!profile) {
      throw new Error('Farmer profile not found');
    }

    // Upload new profile picture if provided
    let profilePictureKey = profile.profilePictureKey;
    if (data.profilePicture) {
      // Delete old profile picture if exists
      if (profilePictureKey) {
        await this.imagesBucket.delete(profilePictureKey);
      }
      profilePictureKey = await this.uploadProfilePicture(
        userId,
        data.profilePicture
      );
    }

    // Update profile
    const now = this.db.getCurrentTimestamp();
    const { sql: updateSql, params: updateParams } = buildUpdateClause({
      farmer_name: data.farmerName,
      farm_name: data.farmName,
      village: data.village,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      contact_number: data.contactNumber,
      description: data.description,
      profile_picture_key: profilePictureKey,
      updated_at: now
    });

    await this.db.execute(
      `UPDATE farmer_profiles SET ${updateSql} WHERE user_id = ?`,
      [...updateParams, userId]
    );

    // Get updated profile
    const updatedProfile = await this.db.queryOne<FarmerProfile>(
      'SELECT * FROM farmer_profiles WHERE user_id = ?',
      [userId]
    );

    if (!updatedProfile) {
      throw new Error('Failed to retrieve updated profile');
    }

    return updatedProfile;
  }

  async getProfile(userId: string): Promise<FarmerProfile> {
    const profile = await this.db.queryOne<FarmerProfile>(
      'SELECT * FROM farmer_profiles WHERE user_id = ?',
      [userId]
    );

    if (!profile) {
      throw new Error('Farmer profile not found');
    }

    return profile;
  }

  async getProfileById(profileId: string): Promise<FarmerProfile> {
    const profile = await this.db.queryOne<FarmerProfile>(
      'SELECT * FROM farmer_profiles WHERE id = ?',
      [profileId]
    );

    if (!profile) {
      throw new Error('Farmer profile not found');
    }

    return profile;
  }

  private async uploadProfilePicture(
    userId: string,
    file: File
  ): Promise<string> {
    const key = `profile-pictures/${userId}/${this.db.generateId()}`;
    await this.imagesBucket.put(key, file);
    return key;
  }
}
```

### 2. Farmer Routes

Create farmer routes (`src/routes/farmers.ts`):

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { FarmerService } from '../services/farmer-service';
import { authMiddleware, roleGuard } from '../middleware/auth';

const router = new Hono();

// Validation schemas
const createProfileSchema = z.object({
  farmerName: z.string().min(1),
  farmName: z.string().min(1),
  village: z.string().min(1),
  district: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().optional(),
  contactNumber: z.string().optional(),
  description: z.string().optional()
});

const updateProfileSchema = createProfileSchema.partial();

// Create/Update profile
router.post(
  '/profile',
  authMiddleware,
  roleGuard('farmer'),
  zValidator('json', createProfileSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    
    // Handle profile picture upload
    let profilePicture: File | undefined;
    const form = await c.req.formData();
    const file = form.get('profilePicture');
    if (file instanceof File) {
      profilePicture = file;
    }

    const farmerService = new FarmerService(
      c.get('db'),
      c.env.IMAGES
    );

    try {
      const profile = await farmerService.createProfile(user.sub, {
        ...data,
        profilePicture
      });

      return c.json(profile);
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

router.put(
  '/profile',
  authMiddleware,
  roleGuard('farmer'),
  zValidator('json', updateProfileSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    
    // Handle profile picture upload
    let profilePicture: File | undefined;
    const form = await c.req.formData();
    const file = form.get('profilePicture');
    if (file instanceof File) {
      profilePicture = file;
    }

    const farmerService = new FarmerService(
      c.get('db'),
      c.env.IMAGES
    );

    try {
      const profile = await farmerService.updateProfile(user.sub, {
        ...data,
        profilePicture
      });

      return c.json(profile);
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }
);

// Get current farmer profile
router.get(
  '/profile/me',
  authMiddleware,
  roleGuard('farmer'),
  async (c) => {
    const user = c.get('user');
    
    const farmerService = new FarmerService(
      c.get('db'),
      c.env.IMAGES
    );

    try {
      const profile = await farmerService.getProfile(user.sub);
      return c.json(profile);
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  }
);

// Get farmer profile by ID
router.get(
  '/profile/:id',
  async (c) => {
    const profileId = c.req.param('id');
    
    const farmerService = new FarmerService(
      c.get('db'),
      c.env.IMAGES
    );

    try {
      const profile = await farmerService.getProfileById(profileId);
      return c.json(profile);
    } catch (error) {
      if (error instanceof Error) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  }
);

export { router as farmersRouter };
```

### 3. Testing Farmer Profile APIs

You can test the farmer profile endpoints using cURL or Postman:

```bash
# Create farmer profile (multipart form data)
curl -X POST http://localhost:8787/api/v1/farmers/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "farmerName=John Farmer" \
  -F "farmName=Green Acres" \
  -F "village=Sample Village" \
  -F "district=Sample District" \
  -F "state=Sample State" \
  -F "pincode=123456" \
  -F "contactNumber=1234567890" \
  -F "description=Organic farmer with 10 years of experience" \
  -F "profilePicture=@/path/to/image.jpg"

# Update farmer profile
curl -X PUT http://localhost:8787/api/v1/farmers/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "farmerName": "John Updated Farmer",
    "description": "Updated description"
  }'

# Get current farmer profile
curl -X GET http://localhost:8787/api/v1/farmers/profile/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Get farmer profile by ID
curl -X GET http://localhost:8787/api/v1/farmers/profile/PROFILE_ID
```

## Next Steps

The next sections will cover:
1. Product Management APIs
2. File storage setup with R2
3. Translation system with KV
4. Order processing with Durable Objects
5. Analytics implementation
6. Testing and deployment procedures

Each section will be detailed with code examples and step-by-step instructions. 