import { DEV_ADMIN_TOKEN, readAdminToken } from '../../apps/api/src/admin/admin.config';
import {
  changeFlightStatus,
  type SeededDatabase,
  snapshotEnv,
  startApi,
  startSeededDatabase,
} from '../support/api';

const env = (values: Record<string, string | undefined>) => (name: string) => values[name];

describe('arranque seguro con ADMIN_TOKEN', () => {
  describe('readAdminToken', () => {
    it('en desarrollo usa el token configurado o, sin él, el de desarrollo', () => {
      expect(readAdminToken(env({ NODE_ENV: 'development' }))).toBe(DEV_ADMIN_TOKEN);
      expect(readAdminToken(env({ ADMIN_TOKEN: 'propio' }))).toBe('propio');
    });

    it.each([
      ['ausente', undefined],
      ['vacío', ''],
      ['igual al de desarrollo', DEV_ADMIN_TOKEN],
    ])('en producción rechaza un token %s', (_case, token) => {
      expect(() => readAdminToken(env({ NODE_ENV: 'production', ADMIN_TOKEN: token }))).toThrow(
        /ADMIN_TOKEN/,
      );
    });

    it('el error no muestra el valor del token', () => {
      expect(() =>
        readAdminToken(env({ NODE_ENV: 'production', ADMIN_TOKEN: DEV_ADMIN_TOKEN })),
      ).toThrow(expect.objectContaining({ message: expect.not.stringContaining(DEV_ADMIN_TOKEN) }));
    });
  });

  describe('la API completa', () => {
    let seeded: SeededDatabase;
    let restoreEnv: () => void;

    beforeAll(async () => {
      restoreEnv = snapshotEnv();
      seeded = await startSeededDatabase();
    });

    afterAll(async () => {
      restoreEnv();
      await seeded?.stop();
    });

    it('no arranca en producción con el token de desarrollo', async () => {
      await expect(
        startApi(seeded, { NODE_ENV: 'production', ADMIN_TOKEN: DEV_ADMIN_TOKEN }, false),
      ).rejects.toThrow(/ADMIN_TOKEN/);
    });

    it('arranca en producción con un token propio y lo exige', async () => {
      const token = 'token-propio-de-produccion-123';
      const api = await startApi(seeded, { NODE_ENV: 'production', ADMIN_TOKEN: token });
      try {
        const flightId = seeded.nextFlightId();
        expect((await changeFlightStatus(api, flightId, 'DELAYED', DEV_ADMIN_TOKEN)).status).toBe(
          401,
        );
        expect((await changeFlightStatus(api, flightId, 'DELAYED', token)).status).toBe(200);
      } finally {
        await api.close();
      }
    });
  });
});
