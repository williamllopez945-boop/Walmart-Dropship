// Walmart Marketplace OAuth2 (client_credentials). Tokens live 900s; refresh 60s early.

import { randomUUID } from 'node:crypto';

const BASE_URLS = {
  sandbox: 'https://sandbox.walmartapis.com',
  production: 'https://marketplace.walmartapis.com',
} as const;

export type WalmartEnv = keyof typeof BASE_URLS;

export interface WalmartCreds {
  clientId: string;
  clientSecret: string;
  env: WalmartEnv;
}

export class WalmartError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = 'WalmartError';
  }
}

const REFRESH_MARGIN_MS = 60_000;
const tokens = new Map<string, { value: string; expiresAt: number }>();

export function credsFromEnv(): WalmartCreds {
  const { WALMART_CLIENT_ID, WALMART_CLIENT_SECRET, WALMART_ENV = 'sandbox' } = process.env;
  if (!WALMART_CLIENT_ID || !WALMART_CLIENT_SECRET) {
    throw new Error('Set WALMART_CLIENT_ID and WALMART_CLIENT_SECRET (see .env.example)');
  }
  if (!(WALMART_ENV in BASE_URLS)) throw new Error(`Unknown WALMART_ENV: ${WALMART_ENV}`);
  return {
    clientId: WALMART_CLIENT_ID,
    clientSecret: WALMART_CLIENT_SECRET,
    env: WALMART_ENV as WalmartEnv,
  };
}

function baseHeaders(): Record<string, string> {
  return {
    'WM_SVC.NAME': 'Walmart Marketplace',
    'WM_QOS.CORRELATION_ID': randomUUID(),
    Accept: 'application/json',
  };
}

async function getToken(creds: WalmartCreds): Promise<string> {
  const key = `${creds.env}:${creds.clientId}`;
  const hit = tokens.get(key);
  if (hit && hit.expiresAt - Date.now() > REFRESH_MARGIN_MS) return hit.value;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch(`${BASE_URLS[creds.env]}/v3/token`, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new WalmartError(`Token request failed (${res.status})`, res.status, await res.text());

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(key, { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 900) * 1000 });
  return json.access_token;
}

export async function walmartFetch<T>(
  creds: WalmartCreds,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken(creds);
  const res = await fetch(`${BASE_URLS[creds.env]}${path}`, {
    method,
    headers: {
      ...baseHeaders(),
      'WM_SEC.ACCESS_TOKEN': token,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new WalmartError(`${method} ${path} failed (${res.status})`, res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
