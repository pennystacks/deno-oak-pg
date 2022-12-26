import "https://deno.land/std@0.170.0/dotenv/load.ts";
import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

interface User {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
}

const app = new Application();
const DB_URL = Deno.env.get("DB_URL");

if (!DB_URL) {
  throw new Error("DB_URL must be defined in environment variables.");
}

const dbPool = new Pool(DB_URL, 10);

if (Deno.env.get("DENO_ENV") !== "production") {
  app.use(async (ctx, next) => {
    await next();
    const rt = ctx.response.headers.get("X-Response-Time");
    console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
  });
}

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

const userRouter = new Router();

userRouter.get("/json", (ctx) => {
  ctx.response.body = { hello: "world", foo: "bar" };
});

userRouter.get("/profile/:id", async (ctx) => {
  const { id } = ctx.params;
  const client = await dbPool.connect();

  const res = await client.queryObject<User>(
    "SELECT * FROM users WHERE users.id = $1",
    [id]
  );

  if (!res.rowCount || res.rowCount === 0) {
    ctx.response.status = 404;
    ctx.response.body = { code: 404, message: "User not found" };
  } else {
    ctx.response.body = { ...res.rows[0] };
  }
});

userRouter.get("/users/:page", async (ctx) => {
  const { page } = ctx.params;
  const start = (parseInt(page) - 1) * 10;

  const client = await dbPool.connect();
  const res = await client.queryObject<User>(
    `
    SELECT * FROM users
    OFFSET $1 LIMIT 10;
  `,
    [start]
  );

  ctx.response.body = { ...res.rows };
});

userRouter.post("/users", async (ctx) => {
  const body = (await ctx.request.body().value) as {
    name: string;
    email: string;
  };

  const client = await dbPool.connect();
  const res = await client.queryObject<User>(
    `
    INSERT INTO users (name, email)
    VALUES ($NAME, $EMAIL)
    RETURNING *;
  `,
    body
  );
  ctx.response.body = { ...res.rows[0] };
});

app.use(userRouter.routes(), userRouter.allowedMethods());

app.listen({
  port: parseInt(Deno.env.get("PORT") ?? "5000") ?? 5000,
});

app.addEventListener("listen", (e) => {
  console.log(`Started server at ${e.hostname}:${e.port}`);
});

app.addEventListener("error", (e) => {
  console.error(`Could not start server: ${e.error}`);
  dbPool.end();
});
