/** Apply the checked-in Poly-Glot schema migrations to Neon. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sqlDir = join(__dirname, "..", "entitlement-service", "sql");
const files = readdirSync(sqlDir).filter(f => f.endsWith(".sql")).sort();

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(join(sqlDir, file), "utf8");
    await client.query(sql);
    console.log(`Neon migration ${file} applied successfully.`);
  }
} finally {
  await client.end();
}
