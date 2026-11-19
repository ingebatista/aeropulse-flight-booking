import type { DataSource } from 'typeorm';
import { startTestDatabase, type TestDatabase } from '../support/postgres';

describe('migraciones y permisos del rol app', () => {
  let db: TestDatabase;
  let owner: DataSource;
  let app: DataSource;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = await db.owner().initialize();
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await db?.stop();
  });

  it('aplica las migraciones con el rol propietario y no repite ninguna', async () => {
    const applied = await owner.runMigrations();
    expect(applied.map((m) => m.name)).toContain('AppRoleGrants1763510400000');

    expect(await owner.runMigrations()).toHaveLength(0);
  });

  it('da al rol app acceso a los datos de las tablas que creen migraciones posteriores', async () => {
    // Simula una migración futura: la crea el propietario, después de los privilegios por defecto.
    await owner.query('CREATE TABLE grant_probe (id serial PRIMARY KEY, value text NOT NULL)');

    app = await db.app().initialize();
    await app.query(`INSERT INTO grant_probe (value) VALUES ('ok')`);
    const rows: Array<{ value: string }> = await app.query('SELECT value FROM grant_probe');
    await app.query(`UPDATE grant_probe SET value = 'updated'`);
    await app.query('DELETE FROM grant_probe');

    expect(rows).toEqual([{ value: 'ok' }]);
  });

  it('no permite al rol app cambiar el esquema', async () => {
    await expect(app.query('CREATE TABLE forbidden (id int)')).rejects.toThrow(/permission denied/);
    await expect(app.query('DROP TABLE grant_probe')).rejects.toThrow(/must be owner/);
  });
});
