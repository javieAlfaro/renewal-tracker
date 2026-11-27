// Share successful and in-flight initialization, but allow a failed attempt to retry.
export function createSessionInitializer<T>(initialize: () => Promise<T>) {
  let attempt: Promise<T> | undefined;
  return () => {
    attempt ??= Promise.resolve()
      .then(initialize)
      .catch((error: unknown) => {
        attempt = undefined;
        throw error;
      });
    return attempt;
  };
}
