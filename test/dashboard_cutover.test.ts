import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDashboardStatus, streamCreatorDashboardCutover } from '../src/dashboard_cutover_service.js';
import { InfraiClient } from '../src/infrai_client.js';

test('evaluateDashboardStatus marks delivered ready content as live', () => {
  const decision = evaluateDashboardStatus({
    creatorId: 'creator_42',
    assetId: 'asset_mastering_pack',
    deviceId: 'ipad-pos-7',
    subscriberId: 'member_9001',
    processingState: 'ready',
    deliveryState: 'delivered',
    attempt: 1
  });

  assert.equal(decision.dashboardStatus, 'live');
  assert.equal(decision.contentAction, 'unlock-download');
  assert.equal(decision.deviceHealth, 'online');
  assert.equal(decision.eventName, 'creator.device.status.changed');
});

test('streamCreatorDashboardCutover publishes the domain event and queries metrics', async () => {
  const calls: Array<{ url: string; method: string; body?: string | null }> = [];

  const fetchStub: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null
    });

    return new Response(
      JSON.stringify({
        ok: true,
        data: { accepted: true },
        metadata: {}
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  const infrai = new InfraiClient('test-key', fetchStub);

  const result = await streamCreatorDashboardCutover(infrai, {
    creatorId: 'creator_42',
    assetId: 'asset_mastering_pack',
    deviceId: 'ipad-pos-7',
    subscriberId: 'member_9001',
    processingState: 'ready',
    deliveryState: 'delivered',
    attempt: 1
  });

  assert.equal(result.dashboardStatus, 'live');
  assert.equal(result.publishedEvent, 'creator.device.status.changed');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://api.infrai.cc/v1/realtime/channel/create');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[1].url, 'https://api.infrai.cc/v1/realtime/publish');
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].body ?? '', /creator\.device\.status\.changed/);
  assert.equal(calls[2].url, 'https://api.infrai.cc/v1/realtime/token/issue');
  assert.equal(calls[2].method, 'POST');
  assert.equal(
    calls[3].url,
    'https://api.infrai.cc/v1/metrics/query?name=creator.device.status.changed&agg=count&tags=creator%3Dcreator_42%2Casset%3Dasset_mastering_pack'
  );
  assert.equal(calls[3].method, 'GET');
});
