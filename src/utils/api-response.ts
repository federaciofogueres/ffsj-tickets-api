export const ok = <T>(data: T) => ({ ok: true, data });

export const fail = (code: string, message: string, details?: unknown) => ({
  ok: false,
  error: { code, message, details }
});
