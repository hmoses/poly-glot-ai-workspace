/** Apply the checked-in Poly-Glot entitlement schema to Neon. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = readFileSync(join(__dirname, "..", "entitlement-service", "sql", "001_init.sql"), "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("Neon migration 001_init.sql applied successfully.");
} finally {
  await client.end();
}
