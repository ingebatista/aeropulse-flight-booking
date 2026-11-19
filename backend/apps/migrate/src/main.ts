import { postgresOptions } from '@backend/persistence';
import { DataSource } from 'typeorm';

async function migrate(): Promise<void> {
  const dataSource = new DataSource(
    postgresOptions(process.env.MIGRATION_DATABASE_URL, {
      database: process.env.DB_NAME,
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      username: process.env.DB_OWNER ?? 'flights_owner',
      password: process.env.DB_OWNER_PASSWORD ?? 'flights_owner_dev',
    }),
  );

  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    console.log(`Migraciones aplicadas: ${migrations.length}`);
  } finally {
    await dataSource.destroy();
  }
}

void migrate();
