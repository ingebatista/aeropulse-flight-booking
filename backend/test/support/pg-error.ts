/** Comprueba que una sentencia falla con el código SQLSTATE y la restricción esperados. */
export async function expectPgError(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }

  expect(failure).toBeDefined();
  const driverError = ((failure as { driverError?: unknown }).driverError ?? failure) as {
    code?: string;
    constraint?: string;
  };
  expect(driverError.code).toBe(code);
  if (constraint) expect(driverError.constraint).toBe(constraint);
}
