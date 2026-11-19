import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

interface PostgresConnection {
  host?: string;
  port?: string;
  database?: string;
  username: string;
  password: string;
}

export function postgresOptions(
  url: string | undefined,
  connection: PostgresConnection,
): DataSourceOptions {
  return {
    type: 'postgres',
    ...(url
      ? { url }
      : {
          host: connection.host ?? '127.0.0.1',
          port: Number(connection.port ?? 5433),
          database: connection.database ?? 'flights',
          username: connection.username,
          password: connection.password,
        }),
    connectTimeoutMS: 5_000,
    synchronize: false,
    migrationsRun: false,
    // Listas de clases, no patrones de rutas: webpack junta todo en un archivo.
    entities: ENTITIES,
    migrations: MIGRATIONS,
  };
}
