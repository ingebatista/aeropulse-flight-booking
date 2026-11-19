import { postgresOptions, runSeed } from '@backend/persistence';
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

    const seed = await runSeed(dataSource);
    console.log(
      `Seed: ${seed.catalogFlights} vuelos en la ventana, ` +
        `${seed.flightsInserted} vuelos y ${seed.seatsInserted} asientos nuevos`,
    );
  } finally {
    await dataSource.destroy();
  }
}

void migrate();
