import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const directionArg = process.argv[2];
const direction = directionArg === "down" ? "down" : "up";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error("DATABASE_URL is required for running migrations.");
    process.exit(1);
}

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const migrationsDir = resolve(scriptDir, "../../../migrations");

try {
    const applied = await runner({
        databaseUrl,
        dir: migrationsDir,
        direction,
        migrationsTable: "pgmigrations",
        checkOrder: true,
        createSchema: true,
        createMigrationsSchema: true,
        log: (message) => console.log(message),
    });

    console.log(
        `Migration ${direction} completed. Processed ${applied.length} migration(s).`
    );
} catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
}
