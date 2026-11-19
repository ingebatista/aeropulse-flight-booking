import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos del rol `app`, con el que se conecta la API.
 *
 * El rol se crea en `docker/db-init` y solo recibe `USAGE` sobre el esquema.
 * Esta migración le da acceso a los datos (nunca DDL) en las tablas y
 * secuencias que existan y, mediante privilegios por defecto, en las que creen
 * las migraciones siguientes, que se ejecutan con el rol propietario.
 */
export class AppRoleGrants1763510400000 implements MigrationInterface {
  name = 'AppRoleGrants1763510400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO app`);
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`,
    );
    await queryRunner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app`);
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM app`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app`,
    );
    await queryRunner.query(`REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM app`);
    await queryRunner.query(
      `REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM app`,
    );
  }
}
