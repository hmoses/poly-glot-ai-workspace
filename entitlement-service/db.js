/**
 * POLY-GLOT DATABASE ACCESS
 * GOOSE NOTE: DATABASE_URL must point to Neon Postgres in production.
 * Neon Functions inject DATABASE_URL automatically. Keep a small connection
 * pool and reuse it at module scope. All entitlement decisions derive from
 * persisted, server-verified transaction/trial records.
 */
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

export const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === "disable" ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false),
  max: Number(process.env.PGPOOL_MAX || 10),
});

export async function ensureUser(subject) {
  await pool.query(
    `INSERT INTO polyglot_users(subject) VALUES($1)
     ON CONFLICT(subject) DO UPDATE SET updated_at = now()`,
    [subject]
  );
}

// GOOSE NOTE: COALESCE makes trial start idempotent. Repeated calls must not restart the trial.
export async function startTrial(subject, trialDays = 3) {
  await ensureUser(subject);
  const { rows } = await pool.query(
    `UPDATE polyglot_users
       SET trial_started_at = COALESCE(trial_started_at, now()),
           trial_ends_at = COALESCE(trial_ends_at, now() + ($2::text || ' days')::interval),
           updated_at = now()
     WHERE subject = $1
     RETURNING trial_started_at, trial_ends_at`,
    [subject, String(trialDays)]
  );
  return rows[0];
}

// GOOSE NOTE: Persist only transactions that have already passed Apple JWS verification.
export async function upsertTransaction(tx, userSubject = null) {
  if (userSubject) await ensureUser(userSubject);
  const values = [
    String(tx.originalTransactionId), String(tx.transactionId), userSubject,
    tx.appAccountToken || null, tx.productId, tx.environment || "Production",
    tx.purchaseDate ? new Date(Number(tx.purchaseDate)) : null,
    tx.expiresDate ? new Date(Number(tx.expiresDate)) : null,
    tx.revocationDate ? new Date(Number(tx.revocationDate)) : null,
    tx.inAppOwnershipType || null, tx.__signed,
  ];
  await pool.query(
    `INSERT INTO apple_transactions(
       original_transaction_id, transaction_id, user_subject, app_account_token, product_id,
       environment, purchase_date, expires_at, revocation_date, ownership_type, raw_signed_transaction)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(original_transaction_id) DO UPDATE SET
       transaction_id = EXCLUDED.transaction_id,
       user_subject = COALESCE(EXCLUDED.user_subject, apple_transactions.user_subject),
       app_account_token = COALESCE(EXCLUDED.app_account_token, apple_transactions.app_account_token),
       product_id = EXCLUDED.product_id,
       environment = EXCLUDED.environment,
       purchase_date = EXCLUDED.purchase_date,
       expires_at = EXCLUDED.expires_at,
       revocation_date = EXCLUDED.revocation_date,
       ownership_type = EXCLUDED.ownership_type,
       raw_signed_transaction = EXCLUDED.raw_signed_transaction,
       updated_at = now()`,
    values
  );
}

export async function linkTransactionToSubject(originalTransactionId, subject) {
  await ensureUser(subject);
  await pool.query(
    `UPDATE apple_transactions SET user_subject=$2, updated_at=now()
     WHERE original_transaction_id=$1`,
    [String(originalTransactionId), subject]
  );
}

export async function subjectForTransaction(tx) {
  if (tx.appAccountToken) {
    const { rows } = await pool.query(
      `SELECT user_subject FROM apple_transactions
       WHERE app_account_token=$1 AND user_subject IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`, [tx.appAccountToken]);
    if (rows[0]?.user_subject) return rows[0].user_subject;
  }
  const { rows } = await pool.query(
    `SELECT user_subject FROM apple_transactions WHERE original_transaction_id=$1`,
    [String(tx.originalTransactionId)]
  );
  return rows[0]?.user_subject || null;
}

// GOOSE NOTE: This query is the final source for Pro/trial authorization decisions.
export async function entitlementForSubject(subject) {
  await ensureUser(subject);
  const userQ = await pool.query(`SELECT trial_started_at, trial_ends_at FROM polyglot_users WHERE subject=$1`, [subject]);
  const txQ = await pool.query(
    `SELECT product_id, expires_at, revocation_date
       FROM apple_transactions
      WHERE user_subject=$1
        AND revocation_date IS NULL
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at DESC NULLS FIRST LIMIT 1`, [subject]);
  return { user: userQ.rows[0], transaction: txQ.rows[0] || null };
}
