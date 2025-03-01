import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import auth from './routes/auth';
import { getPrismaClient, disconnectPrisma } from './utils/prisma';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  TRANSLATIONS: KVNamespace;
  ORDER_PROCESSOR: Queue;
  NOTIFICATION_PROCESSOR: Queue;
  JWT_SECRET: string;
  ORDER_PROCESSOR_DO: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use("*", cors());
app.use("*", logger());
app.use("*", prettyJSON());

// Initialize Prisma Client with D1 for each request
app.use("*", async (c, next) => {
  // Initialize Prisma with D1 database
  getPrismaClient(c.env.DB);
  await next();
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// Routes
app.route('/api/v1/auth', auth);

// Error handling
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json(
    {
      error: {
        message: err.message,
        code: err instanceof Error ? err.name : "UnknownError",
      },
    },
    500
  );
});

// Clean up Prisma on worker termination
addEventListener('unhandledrejection', async (event) => {
  console.error('Unhandled rejection:', event.reason);
  await disconnectPrisma();
});

export default app;
