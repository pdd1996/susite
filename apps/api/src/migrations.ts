import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

const migrationDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
const baselineMigrationCount = 4;

type Migration = {
  filename: string;
  checksum: string;
  sql: string;
};

type DatabaseFacts = RowDataPacket & {
  version: string;
  characterSet: string;
  collation: string;
};

export type MigrationResult = {
  applied: string[];
  skipped: string[];
  baselined: string[];
};

async function loadMigrations(): Promise<Migration[]> {
  const filenames = (await readdir(migrationDirectory))
    .filter((filename) => /^\d{4}_.+\.sql$/.test(filename))
    .sort();
  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex")
      };
    })
  );
}

async function validateDatabase(pool: Connection): Promise<void> {
  const [[facts]] = await pool.query<DatabaseFacts[]>(
    `SELECT VERSION() AS version,
      @@character_set_database AS characterSet,
      @@collation_database AS collation`
  );
  if (!facts || /mariadb/i.test(facts.version)) {
    throw new Error(`Unsupported database server: ${facts?.version ?? "unknown"}`);
  }
  const version = facts.version.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  if (
    !version ||
    version[0] < 8 ||
    (version[0] === 8 && version[1] === 0 && version[2] < 16)
  ) {
    throw new Error(`MySQL 8.0.16 or newer is required; found ${facts.version}`);
  }
  if (facts.characterSet !== "utf8mb4" || facts.collation !== "utf8mb4_0900_ai_ci") {
    throw new Error(
      `Database must use utf8mb4/utf8mb4_0900_ai_ci; found ${facts.characterSet}/${facts.collation}`
    );
  }
  await pool.query("SET time_zone = '+00:00'");
}

async function hasApplicationTables(pool: Connection): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('sites', 'site_revisions', 'audit_logs', 'assets', 'build_artifacts', 'deployments')
      LIMIT 1`
  );
  return rows.length > 0;
}

async function assertBaselineSchema(pool: Connection): Promise<void> {
  const [tables] = await pool.query<RowDataPacket[]>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('sites', 'site_revisions', 'audit_logs', 'assets', 'build_artifacts', 'deployments')`
  );
  if (tables.length !== 6) {
    throw new Error("Cannot baseline: expected all six Phase 2 tables.");
  }
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT CONCAT(table_name, '.', column_name) AS name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND (
          (table_name = 'build_artifacts' AND column_name IN ('status', 'lease_expires_at'))
          OR (table_name = 'deployments' AND column_name = 'lease_expires_at')
        )`
  );
  if (columns.length !== 3) {
    throw new Error("Cannot baseline: database has not reached migration 0003.");
  }
  const [constraints] = await pool.query<RowDataPacket[]>(
    `SELECT constraint_name
       FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND constraint_name IN (
          'site_revisions_site_id_fk',
          'audit_logs_site_id_fk',
          'assets_site_fk',
          'assets_source_approval_ck',
          'build_artifacts_revision_fk',
          'build_artifacts_status_ck',
          'deployments_revision_fk',
          'deployments_artifact_fk',
          'deployments_status_ck'
        )`
  );
  if (constraints.length !== 9) {
    throw new Error("Cannot baseline: required Phase 1/2 constraints are missing.");
  }
}

export async function runMigrations(
  databaseUrl: string,
  options: { baselineExisting?: boolean } = {}
): Promise<MigrationResult> {
  const pool = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
    timezone: "Z"
  });
  const result: MigrationResult = { applied: [], skipped: [], baselined: [] };
  let migrationLockAcquired = false;
  try {
    await validateDatabase(pool);
    const [[lock]] = await pool.query<Array<RowDataPacket & { acquired: number | null }>>(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':zhansite-migrations'), 30) AS acquired"
    );
    if (lock?.acquired !== 1) {
      throw new Error("Could not acquire the migration lock within 30 seconds.");
    }
    migrationLockAcquired = true;
    const migrations = await loadMigrations();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`_zhansite_migrations\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`filename\` varchar(255) NOT NULL,
        \`checksum_sha256\` char(64) NOT NULL,
        \`applied_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`zhansite_migrations_filename_uq\` (\`filename\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const [appliedRows] = await pool.query<Array<RowDataPacket & {
      filename: string;
      checksumSha256: string;
    }>>(
      "SELECT filename, checksum_sha256 AS checksumSha256 FROM `_zhansite_migrations` ORDER BY filename"
    );
    const applied = new Map(
      appliedRows.map((row) => [row.filename, row.checksumSha256])
    );

    if (applied.size === 0 && (await hasApplicationTables(pool))) {
      if (!options.baselineExisting) {
        throw new Error(
          "Existing schema has no migration journal. Re-run once with --baseline-existing after backup and schema verification."
        );
      }
      await assertBaselineSchema(pool);
      for (const migration of migrations.slice(0, baselineMigrationCount)) {
        await pool.query(
          "INSERT INTO `_zhansite_migrations` (`filename`, `checksum_sha256`) VALUES (?, ?)",
          [migration.filename, migration.checksum]
        );
        applied.set(migration.filename, migration.checksum);
        result.baselined.push(migration.filename);
      }
    }

    for (const migration of migrations) {
      const recordedChecksum = applied.get(migration.filename);
      if (recordedChecksum) {
        if (recordedChecksum !== migration.checksum) {
          throw new Error(`Applied migration checksum mismatch: ${migration.filename}`);
        }
        result.skipped.push(migration.filename);
        continue;
      }
      await pool.query(migration.sql);
      await pool.query(
        "INSERT INTO `_zhansite_migrations` (`filename`, `checksum_sha256`) VALUES (?, ?)",
        [migration.filename, migration.checksum]
      );
      result.applied.push(migration.filename);
    }
    return result;
  } finally {
    try {
      if (migrationLockAcquired) {
        await pool.query("DO RELEASE_LOCK(CONCAT(DATABASE(), ':zhansite-migrations'))");
      }
    } finally {
      await pool.end();
    }
  }
}
