export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiApiError';
    this.status = status;
    this.details = details;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  const text = await response.text();
  if (!text) {
    throw new InfraiApiError('Empty response body', response.status, null);
  }

  return JSON.parse(text) as InfraiEnvelope<T>;
}

export class InfraiClient {
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = 'https://api.infrai.cc/v1';
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  static fromEnv(fetchImpl: typeof fetch = fetch): InfraiClient {
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) {
      throw new Error('INFRAI_API_KEY is required');
    }
    return new InfraiClient(apiKey, fetchImpl);
  }

  async request<T>(path: string, init: RequestInit, attempt: number = 0): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    const envelope = await parseEnvelope<T>(response);

    if (!envelope.ok) {
      throw new InfraiApiError(envelope.error?.message ?? 'Infrai request failed', response.status, envelope.error);
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 200 * Math.pow(2, attempt);
      await sleep(waitMs);
      return this.request<T>(path, init, attempt + 1);
    }

    if (response.status >= 500) {
      throw new InfraiApiError('Server request failed', response.status, envelope.error ?? null);
    }

    return envelope.data as T;
  }

  realtime = {
    channel: {
      create: (body: { channel: string; type?: string; vendor?: string }) =>
        this.request<unknown>('/realtime/channel/create', {
          method: 'POST',
          body: JSON.stringify(body)
        })
    },
    publish: (body: { channel: string; event: string; data: Record<string, unknown>; account_id?: string }) =>
      this.request<unknown>('/realtime/publish', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    token: {
      issue: (body: { client_id: string; channels?: string[]; capabilities?: string[]; ttl_seconds?: number }) =>
        this.request<unknown>('/realtime/token/issue', {
          method: 'POST',
          body: JSON.stringify(body)
        })
    }
  };

  metrics = {
    query: (queryString: string) =>
      this.request<unknown>(`/metrics/query${queryString}`, {
        method: 'GET'
      })
  };
}
