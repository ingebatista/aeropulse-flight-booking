import { postgresOptions } from '@backend/persistence';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

/** Misma versión que `docker-compose.yml`. */
const POSTGRES_IMAGE = 'postgres:17-alpine';
const DB_NAME = 'flights';
const OWNER = { username: 'flights_owner', password: 'flights_owner_test' };
const APP = { username: 'app', password: 'app_test' };

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  /** Conexión con el rol propietario, como el servicio `migrate`. */
  owner(): DataSource;
  /** Conexión con el rol `app`, como la API. */
  app(): DataSource;
  stop(): Promise<void>;
}

/**
 * Levanta PostgreSQL con el mismo script de `docker/db-init` que usa Compose,
 * de modo que el rol `app` y sus permisos son los de producción.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DB_NAME)
    .withUsername(OWNER.username)
    .withPassword(OWNER.password)
    .withEnvironment({ APP_DB_PASSWORD: APP.password })
    .withCopyFilesToContainer([
      {
        source: join(__dirname, '../../../docker/db-init/01-app-role.sh'),
        target: '/docker-entrypoint-initdb.d/01-app-role.sh',
        mode: 0o755,
      },
    ])
    .start();

  const options = (role: { username: string; password: string }) =>
    postgresOptions(undefined, {
      host: container.getHost(),
      port: String(container.getPort()),
      database: DB_NAME,
      ...role,
    });

  return {
    container,
    owner: () => new DataSource(options(OWNER)),
    app: () => new DataSource(options(APP)),
    stop: async () => {
      await container.stop();
    },
  };
}
