import pg from "pg";

const globalForPool = globalThis as unknown as { justinPool?: pg.Pool };

export function db(): pg.Pool {
  if (!globalForPool.justinPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPool.justinPool = new pg.Pool({ connectionString, max: 5 });
  }
  return globalForPool.justinPool;
}
