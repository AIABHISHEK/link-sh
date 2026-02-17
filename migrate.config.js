require('dotenv').config();

export const databaseUrl = process.env.DATABASE_URL;
export const dir = 'migrations';
export const migrationsTable = 'pgmigrations';
