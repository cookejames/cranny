import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { StatelessDirectory, type RoomDirectory } from '@cranny/multiplayer';
import { ablyBackend } from './ably.ts';
import { handleRequest, isAction } from './api.ts';

// The Lambda entry point behind API Gateway (HTTP API, payload format 2.0), routed from
// CloudFront as `/api/rooms/*` (specs/2026-09-25-multiplayer/SPEC.md §13). The Ably key is read
// from SSM Parameter Store once per container; the parameter's name comes from
// `ABLY_KEY_PARAMETER`.

/** The parts of an API Gateway HTTP API (v2) event the handler reads. */
export type HttpEvent = {
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
};

export type HttpResult = { statusCode: number; headers: Record<string, string>; body: string };

const ssm = new SSMClient({});
let directory: Promise<RoomDirectory> | null = null;

/** Reads the Ably key from SSM and builds the directory; retried on the next request if it fails. */
function loadDirectory(): Promise<RoomDirectory> {
  directory ??= (async () => {
    const name = process.env.ABLY_KEY_PARAMETER;
    if (!name) throw new Error('ABLY_KEY_PARAMETER is not set');
    const { Parameter } = await ssm.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    if (!Parameter?.Value) throw new Error(`SSM parameter ${name} has no value`);
    return new StatelessDirectory(ablyBackend({ key: Parameter.Value }));
  })().catch((error: unknown) => {
    directory = null;
    throw error;
  });
  return directory;
}

/** A JSON response that no cache keeps. */
const json = (statusCode: number, body: unknown): HttpResult => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

/** Routes `POST /api/rooms/<action>` to the directory. */
export async function handler(event: HttpEvent): Promise<HttpResult> {
  const action = event.rawPath.replace(/^\/api\/rooms\//, '');
  if (event.requestContext.http.method !== 'POST' || !isAction(action)) {
    // Not 404, which CloudFront would turn into the app shell.
    return json(400, { error: 'invalid' });
  }
  const body =
    event.body === undefined
      ? null
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
  try {
    const { status, body: result } = await handleRequest(action, body, await loadDirectory());
    return json(status, result);
  } catch (error) {
    console.error('rooms-api:', error instanceof Error ? error.message : error);
    return json(503, { error: 'unavailable' });
  }
}
