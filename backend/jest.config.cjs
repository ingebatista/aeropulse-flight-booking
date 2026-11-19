/**
 * Pruebas del backend.
 * - Unitarias: `*.spec.ts` junto al código (apps/, libs/).
 * - Integración: `test/**\/*.spec.ts`, contra PostgreSQL real con Testcontainers
 *   (requiere Docker). Nunca contra mocks de la base de datos.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/libs', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@backend/(domain|events|persistence)$': '<rootDir>/libs/$1/src',
  },
  // Arrancar un contenedor de PostgreSQL puede tardar en la primera ejecución.
  testTimeout: 120_000,
};
