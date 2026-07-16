import "./load-env.js";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--baseline-existing");
if (unknownArguments.length > 0) {
  throw new Error(`Unknown migration arguments: ${unknownArguments.join(", ")}`);
}

const result = await runMigrations(databaseUrl, {
  baselineExisting: process.argv.includes("--baseline-existing")
});

console.log(
  JSON.stringify({
    applied: result.applied,
    skipped: result.skipped,
    baselined: result.baselined
  })
);
