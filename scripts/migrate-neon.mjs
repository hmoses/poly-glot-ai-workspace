/** Apply all checked-in Poly-Glot entitlement schema migrations to Neon in lexical order. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const migrationsDir = join(__dirname, "..", "entitlement-service", "sql");
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

if (!migrations.length) throw new Error("No entitlement SQL migrations found");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  for (const name of migrations) {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    await client.query(sql);
    console.log(`Neon migration ${name} applied successfully.`);
  }
} finally {
  await client.end();
}
