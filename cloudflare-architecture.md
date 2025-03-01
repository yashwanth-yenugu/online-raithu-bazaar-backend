# Online Raithu Bazaar: Cloudflare Architecture

This document outlines the complete architecture for the Online Raithu Bazaar application, implementing the API requirements using an all-Cloudflare backend stack.

## Architecture Overview

```
┌─────────────────┐
│ Mobile App      │
│ (React Native)  │
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────────────────┐
│ Cloudflare Workers (API Layer)                 │
│ ┌─────────────────┐  ┌─────────────────────┐  │
│ │ Authentication  │  │ API Implementation  │  │
│ │ & Authorization │  │ (Hono Framework)    │  │
│ └─────────────────┘  └─────────────────────┘  │
└───────────┬─────────────────────┬─────────────┘
            │                     │
            ▼                     ▼
┌───────────────────┐   ┌─────────────────────┐
│ Data Storage      │   │ Supporting Services │
│ ┌───────────────┐ │   │ ┌───────────────┐  │
│ │ D1 Database   │ │   │ │ Workers KV    │  │
│ │ (SQL)         │ │   │ │ (Translations)│  │
│ └───────────────┘ │   │ └───────────────┘  │
│ ┌───────────────┐ │   │ ┌───────────────┐  │
│ │ R2            │ │   │ │ Durable       │  │
│ │ (File Storage)│ │   │ │ Objects       │  │
│ └───────────────┘ │   │ │ (Sessions)    │  │
│ ┌───────────────┐ │   │ └───────────────┘  │
│ │ Queues        │ │   │ ┌───────────────┐  │
│ │ (Background   │ │   │ │ Analytics     │  │
│ │  Processing)  │ │   │ │ Engine        │  │
│ └───────────────┘ │   │ └───────────────┘  │
└───────────────────┘   └─────────────────────┘
```

## Service Selection

| Requirement | Cloudflare Service | Justification |
|-------------|-------------------|---------------|
| User Authentication | Workers + D1 | Store user credentials and session data |
| Product/Farmer Data | D1 (SQL) | Relational data with complex queries |
| Image Storage | R2 | Efficient object storage for profile/product images |
| Translations | Workers KV | Fast, globally distributed key-value store |
| Order Processing | D1 + Durable Objects | Transaction consistency for orders |
| Background Tasks | Queues | Handle notifications, emails, etc. |
| Analytics | Analytics Engine | Track sales, user behavior, etc. |
| Search | D1 (with indexes) | SQL-based search with proper indexing |

## Detailed Implementation

### 1. Database Schema (D1)

D1 will serve as our primary database. Here's the schema structure:

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

### 2. API Structure

We'll structure our API using Cloudflare Workers with the Hono framework:

```
/api/v1
├── /auth
│   ├── /log-in         # User login
│   ├── /sign-up        # User registration
│   └── /logout         # User logout
├── /users
│   ├── /me             # Get current user
│   ├── /me/role        # Update role
│   └── /me/preferences # User preferences
├── /farmers
│   ├── /profile        # Create/update farmer profile
│   ├── /profile/:id    # Get farmer profile
│   ├── /profile/me     # Get current farmer profile
│   ├── /:id/products   # List farmer products
│   ├── /me/products    # List my products
│   ├── /me/orders      # List farmer orders
│   └── /me/analytics   # Get sales analytics
├── /products
│   ├── /               # Create product (POST), List products (GET)
│   ├── /:id            # Get, update, delete product
│   └── /search         # Search products
├── /categories
│   └── /               # List categories
├── /orders
│   ├── /               # Create order
│   ├── /:id            # Get order
│   ├── /my-orders      # List consumer orders
│   └── /:id/status     # Update order status
├── /translations
│   └── /               # Get translations
└── /sync
    └── /               # Sync offline data
```

### 3. Cloudflare Workers Implementation

We'll implement the API using Cloudflare Workers with the Hono framework:

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { D1Database } from '@cloudflare/workers-types';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { farmersRouter } from './routes/farmers';
import { productsRouter } from './routes/products';
import { categoriesRouter } from './routes/categories';
import { ordersRouter } from './routes/orders';
import { translationsRouter } from './routes/translations';
import { syncRouter } from './routes/sync';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  TRANSLATIONS: KVNamespace;
  ORDER_PROCESSOR: Queue;
  NOTIFICATION_PROCESSOR: Queue;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', cors());
app.use('/api/v1/*', async (c, next) => {
  const publicPaths = [
    '/api/v1/auth/log-in',
    '/api/v1/auth/sign-up',
    '/api/v1/products',
    '/api/v1/products/search',
    '/api/v1/categories',
    '/api/v1/translations'
  ];
  
  if (publicPaths.includes(c.req.path) || 
      (c.req.path.startsWith('/api/v1/products/') && c.req.method === 'GET') ||
      (c.req.path.startsWith('/api/v1/farmers/profile/') && c.req.method === 'GET')) {
    return next();
  }
  
  return jwt({ secret: c.env.JWT_SECRET })(c, next);
});

// Routes
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/farmers', farmersRouter);
app.route('/api/v1/products', productsRouter);
app.route('/api/v1/categories', categoriesRouter);
app.route('/api/v1/orders', ordersRouter);
app.route('/api/v1/translations', translationsRouter);
app.route('/api/v1/sync', syncRouter);

export default app;
```

### 4. Service Integration

#### D1 Database Access

```typescript
// src/db/users.ts
import { D1Database } from '@cloudflare/workers-types';

export async function getUserByEmail(db: D1Database, email: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?').bind(email);
  return await stmt.first();
}

export async function createUser(db: D1Database, user: any) {
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(),
    user.email,
    user.passwordHash,
    user.name,
    user.role,
    now,
    now
  );
  return await stmt.run();
}
```

#### R2 for Image Storage

```typescript
// src/storage/images.ts
import { R2Bucket } from '@cloudflare/workers-types';

export async function uploadImage(bucket: R2Bucket, file: ArrayBuffer, contentType: string) {
  const imageKey = crypto.randomUUID();
  await bucket.put(imageKey, file, {
    httpMetadata: { contentType }
  });
  return imageKey;
}

export async function getImageUrl(bucket: R2Bucket, imageKey: string) {
  const object = await bucket.head(imageKey);
  if (!object) return null;
  
  // Generate a signed URL or public URL as needed
  return `/api/v1/images/${imageKey}`;
}
```

#### Workers KV for Translations

```typescript
// src/kv/translations.ts
import { KVNamespace } from '@cloudflare/workers-types';

export async function getTranslations(
  kv: KVNamespace, 
  language: string, 
  section?: string
) {
  if (section) {
    const key = `${language}:${section}`;
    return JSON.parse(await kv.get(key) || '{}');
  }
  
  return JSON.parse(await kv.get(language) || '{}');
}
```

#### Queues for Background Processing

```typescript
// src/queues/notifications.ts
import { Queue } from '@cloudflare/workers-types';

interface NotificationMessage {
  type: 'order_update' | 'new_product';
  userId: string;
  data: any;
}

export async function sendNotification(
  queue: Queue, 
  notification: NotificationMessage
) {
  await queue.send(notification);
}
```

### 5. Auth Implementation Example

```typescript
// src/routes/auth.ts
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import * as bcrypt from 'bcryptjs';

const router = new Hono();

router.post('/log-in', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  
  const token = await sign({ 
    sub: user.id, 
    email: user.email,
    role: user.role
  }, c.env.JWT_SECRET);
  
  return c.json({
    accessToken: token,
    expiresIn: 3600,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      profileCompleted: Boolean(user.profile_completed)
    }
  });
});

router.post('/sign-up', async (c) => {
  const { email, password, name, role } = await c.req.json();
  
  // Check if user exists
  const existingUser = await getUserByEmail(c.env.DB, email);
  if (existingUser) {
    return c.json({ error: 'Email already in use' }, 400);
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Create user
  const userId = crypto.randomUUID();
  const now = Date.now();
  
  const result = await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, role, profile_completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    userId,
    email,
    passwordHash,
    name,
    role,
    0,
    now,
    now
  ).run();
  
  if (!result.success) {
    return c.json({ error: 'Failed to create user' }, 500);
  }
  
  // Generate token
  const token = await sign({ 
    sub: userId, 
    email: email,
    role: role
  }, c.env.JWT_SECRET);
  
  return c.json({
    accessToken: token,
    expiresIn: 3600,
    user: {
      id: userId,
      email,
      name,
      role,
      profileCompleted: false
    }
  });
});

router.post('/logout', async (c) => {
  // In a stateless JWT system, the client simply discards the token
  // For added security, you could implement a token blacklist in KV
  return c.json({
    success: true,
    message: 'Successfully logged out'
  });
});

export { router as authRouter };
```

### 6. Durable Objects for Consistent State

```typescript
// src/durable_objects/OrderProcessor.ts
export class OrderProcessor {
  state: DurableObjectState;
  
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  
  async fetch(request: Request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/process' && request.method === 'POST') {
      const orderData = await request.json();
      return await this.processOrder(orderData);
    }
    
    return new Response('Not found', { status: 404 });
  }
  
  async processOrder(orderData: any) {
    // Begin a transaction - all operations will be atomic
    return await this.state.storage.transaction(async (txn) => {
      // Check product availability
      for (const item of orderData.items) {
        const product = await txn.get(`product:${item.productId}`);
        
        if (!product || product.quantity < item.quantity) {
          return new Response(JSON.stringify({
            error: `Product ${item.productId} is not available in requested quantity`
          }), { status: 400 });
        }
        
        // Update product quantities atomically
        product.quantity -= item.quantity;
        await txn.put(`product:${item.productId}`, product);
      }
      
      // Create order
      const order = {
        id: crypto.randomUUID(),
        orderNumber: generateOrderNumber(),
        ...orderData,
        status: 'pending',
        createdAt: Date.now()
      };
      
      await txn.put(`order:${order.id}`, order);
      
      return new Response(JSON.stringify(order), { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    });
  }
}
```

### 7. Analytics using Analytics Engine

```typescript
// src/analytics/sales.ts
export async function trackSaleEvent(c: Context, orderData: any) {
  try {
    await c.env.ANALYTICS_ENGINE.writeDataPoint({
      blobs: [orderData.id, orderData.consumer_id, orderData.payment_method],
      doubles: [orderData.total_amount],
      indexes: ['order_completed', orderData.status]
    });

    // Track individual product sales
    for (const item of orderData.items) {
      await c.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [item.product_id, orderData.id],
        doubles: [item.quantity, item.total_price],
        indexes: ['product_sale', item.product_id]
      });
    }
  } catch (error) {
    console.error('Failed to track analytics:', error);
  }
}

export async function getSalesAnalytics(c: Context, farmerId: string, period: string, startDate?: string, endDate?: string) {
  const now = new Date();
  let start: Date;
  
  switch (period) {
    case 'daily':
      start = new Date(now.setDate(now.getDate() - 30)); // Last 30 days
      break;
    case 'weekly':
      start = new Date(now.setDate(now.getDate() - 90)); // Last 90 days
      break;
    case 'monthly':
      start = new Date(now.setDate(now.getDate() - 365)); // Last 365 days
      break;
    case 'yearly':
      start = new Date(now.setFullYear(now.getFullYear() - 2)); // Last 2 years
      break;
    default:
      start = new Date(now.setDate(now.getDate() - 30)); // Default to 30 days
  }
  
  if (startDate) {
    start = new Date(startDate);
  }
  
  let end = new Date();
  if (endDate) {
    end = new Date(endDate);
  }
  
  // Query Analytics Engine for sales data
  const salesQuery = `
    SELECT sum(double_value) as total_sales, count(*) as order_count
    FROM analytics_events
    WHERE index_1 = 'order_completed'
    AND timestamp BETWEEN "${start.toISOString()}" AND "${end.toISOString()}"
    AND blob_2 = "${farmerId}"
  `;
  
  const productQuery = `
    SELECT blob_1 as product_id, sum(double_value_1) as quantity, sum(double_value_2) as sales
    FROM analytics_events
    WHERE index_1 = 'product_sale'
    AND timestamp BETWEEN "${start.toISOString()}" AND "${end.toISOString()}"
    GROUP BY blob_1
    ORDER BY sales DESC
    LIMIT 5
  `;
  
  const [salesResults, productResults] = await Promise.all([
    c.env.ANALYTICS_ENGINE.query(salesQuery),
    c.env.ANALYTICS_ENGINE.query(productQuery)
  ]);
  
  // Format results
  const totalSales = salesResults.data[0]?.total_sales || 0;
  const totalOrders = salesResults.data[0]?.order_count || 0;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Get product details from D1
  const topSellingProducts = [];
  for (const product of productResults.data) {
    const productDetails = await c.env.DB.prepare(
      'SELECT name_english, name_telugu FROM products WHERE id = ?'
    ).bind(product.product_id).first();
    
    if (productDetails) {
      topSellingProducts.push({
        id: product.product_id,
        name: {
          english: productDetails.name_english,
          telugu: productDetails.name_telugu
        },
        quantity: product.quantity,
        totalSales: product.sales
      });
    }
  }
  
  return {
    totalSales,
    totalOrders,
    averageOrderValue: avgOrderValue,
    topSellingProducts
  };
}
```

## Deployment and Configuration

### 1. Setting Up Project with Wrangler

```
# Install Wrangler
npm install -g wrangler

# Initialize project
mkdir online-raithu-bazaar
cd online-raithu-bazaar
npm init -y
npm install hono bcryptjs
npm install -D wrangler typescript @cloudflare/workers-types

# Initialize wrangler.toml
wrangler init
```

### 2. Wrangler Configuration

```toml
# wrangler.toml
name = "online-raithu-bazaar"
main = "src/index.ts"
compatibility_date = "2023-12-01"

[vars]
# Environment variables here

[[d1_databases]]
binding = "DB"
database_name = "raithu_bazaar"
database_id = "your-d1-database-id"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "raithu-bazaar-images"

[[kv_namespaces]]
binding = "TRANSLATIONS"
id = "your-kv-namespace-id"

[[queues.producers]]
binding = "ORDER_PROCESSOR"
queue = "order-processing"

[[queues.producers]]
binding = "NOTIFICATION_PROCESSOR"
queue = "notifications"

[[analytics_engine_datasets]]
binding = "ANALYTICS_ENGINE"
dataset = "raithu_bazaar_analytics"

[durable_objects]
bindings = [
  { name = "ORDER_PROCESSOR_DO", class_name = "OrderProcessor" }
]

[[migrations]]
tag = "v1"
new_classes = ["OrderProcessor"]
```

### 3. D1 Database Setup

```bash
# Create D1 database
wrangler d1 create raithu_bazaar

# Create tables from schema file
wrangler d1 execute raithu_bazaar --file=./schema.sql
```

### 4. R2 Bucket Setup

```bash
# Create R2 bucket
wrangler r2 bucket create raithu-bazaar-images
```

### 5. KV Namespace Setup

```bash
# Create KV namespace
wrangler kv:namespace create TRANSLATIONS

# Populate translations
wrangler kv:key put --binding=TRANSLATIONS "english" '{"common":{"search":"Search","filter":"Filter"},"product":{"price":"Price","quantity":"Quantity"}}'
wrangler kv:key put --binding=TRANSLATIONS "telugu" '{"common":{"search":"వెతకండి","filter":"ఫిల్టర్"},"product":{"price":"ధర","quantity":"పరిమాణం"}}'
```

## Performance and Scaling Considerations

### 1. Edge Caching Strategy

- Use Cache-Control headers for appropriate resources
- Cache translations in KV for fast global access
- Consider edge caching for product listings and categories

### 2. Database Optimization

- Create appropriate indexes in D1 for common query patterns
- Keep schema design efficient for common operations
- Use pagination for large result sets

### 3. Image Optimization

- Store optimized images in R2
- Consider generating and storing multiple resolutions
- Use appropriate content-type and cache headers

### 4. API Rate Limiting

- Implement rate limiting for public endpoints
- Consider using Workers for custom rate limiting logic

## Security Considerations

### 1. Authentication and Authorization

- JWT tokens with appropriate expiration
- Role-based access control
- Secure password hashing with bcrypt

### 2. Data Protection

- Input validation and sanitization
- SQL injection protection (using prepared statements)
- XSS protection

### 3. CORS Configuration

- Proper CORS headers for mobile app access
- Limit allowed origins as appropriate

## Offline Support Implementation

### 1. Client-Side Data Caching

- Use ETags for efficient caching
- Implement Last-Modified headers for data synchronization

### 2. Sync Mechanism

- Implement batch processing endpoint (/sync) for reconnection
- Handle conflict resolution for offline changes

## Monitoring and Observability

### 1. Error Tracking

- Log errors to Analytics Engine
- Implement structured error format

### 2. Performance Monitoring

- Track API response times
- Monitor database query performance

## Cost Optimization

| Service | Free Tier | Estimated Usage |
|---------|-----------|----------------|
| Workers | 100K requests/day | Medium |
| D1 | 100K rows read, 1K writes/day | High |
| R2 | 10GB storage, 10M operations/month | Medium |
| KV | Free reads from cache | Low |
| Queues | 1M messages/month | Low |
| Durable Objects | 1M requests/month | Low |
| Analytics Engine | Free tier available | Medium |

## Conclusion

This architecture provides a complete serverless solution for the Online Raithu Bazaar application using Cloudflare's ecosystem. It offers:

1. Global distribution with edge computing
2. Scalable and cost-effective storage
3. Robust API implementation
4. Background processing for asynchronous tasks
5. Analytics capabilities for business insights
6. Security and performance optimizations

By leveraging Cloudflare's services exclusively, we eliminate the need for multiple cloud providers while maintaining a high-performance, globally distributed application. 