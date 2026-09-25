import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpEvent } from './handler.ts';

const send = vi.fn();
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
  },
  GetParameterCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

const SELF = 'a'.repeat(22);
const event = (path: string, body: unknown, method = 'POST'): HttpEvent => ({
  rawPath: path,
  body: JSON.stringify(body),
  requestContext: { http: { method } },
});

describe('handler', () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    vi.stubEnv('ABLY_KEY_PARAMETER', '/cranny/ably-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ status: { occupancy: { metrics: { presenceMembers: 0 } } } }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads the key from SSM once and answers a create with a ticket', async () => {
    send.mockResolvedValue({ Parameter: { Value: 'app.key:secret' } });
    const { handler } = await import('./handler.ts');
    const first = await handler(event('/api/rooms/create', { room: 'pizza', self: SELF }));
    await handler(event('/api/rooms/rejoin', { room: 'pizza', self: SELF }));
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(first.body)).toMatchObject({ room: 'pizza', channel: 'room:pizza' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].input).toEqual({
      Name: '/cranny/ably-key',
      WithDecryption: true,
    });
  });

  it('is unavailable while SSM fails, and tries again on the next request', async () => {
    send.mockRejectedValueOnce(new Error('throttled'));
    send.mockResolvedValue({ Parameter: { Value: 'app.key:secret' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = await import('./handler.ts');
    const failed = await handler(event('/api/rooms/create', { room: 'pizza', self: SELF }));
    expect(failed.statusCode).toBe(503);
    const retried = await handler(event('/api/rooms/create', { room: 'pizza', self: SELF }));
    expect(retried.statusCode).toBe(200);
  });

  it('answers 400 for other paths and methods', async () => {
    const { handler } = await import('./handler.ts');
    expect((await handler(event('/api/rooms/delete', {}))).statusCode).toBe(400);
    expect((await handler(event('/api/rooms/create', {}, 'GET'))).statusCode).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
