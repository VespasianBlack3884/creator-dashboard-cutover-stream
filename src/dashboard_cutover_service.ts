import { z } from 'zod';
import { InfraiClient } from './infrai_client.js';

export const creatorDeliveryEventSchema = z.object({
  creatorId: z.string().min(1),
  assetId: z.string().min(1),
  deviceId: z.string().min(1),
  subscriberId: z.string().min(1),
  processingState: z.enum(['queued', 'processing', 'ready']),
  deliveryState: z.enum(['pending', 'delivered']),
  attempt: z.number().int().positive()
});

export type CreatorDeliveryEvent = z.infer<typeof creatorDeliveryEventSchema>;

export type DashboardDecision = {
  dashboardStatus: 'processing' | 'live';
  contentAction: 'hold-download' | 'unlock-download';
  deviceHealth: 'degraded' | 'online';
  eventName: 'creator.device.status.changed';
};

export function buildChannelName(creatorId: string): string {
  return `creator.${creatorId}.dashboard`;
}

export function evaluateDashboardStatus(input: CreatorDeliveryEvent): DashboardDecision {
  if (input.processingState === 'ready' && input.deliveryState === 'delivered') {
    return {
      dashboardStatus: 'live',
      contentAction: 'unlock-download',
      deviceHealth: 'online',
      eventName: 'creator.device.status.changed'
    };
  }

  return {
    dashboardStatus: 'processing',
    contentAction: 'hold-download',
    deviceHealth: 'degraded',
    eventName: 'creator.device.status.changed'
  };
}

export async function streamCreatorDashboardCutover(
  infrai: InfraiClient,
  rawInput: unknown
): Promise<{
  channel: string;
  dashboardStatus: DashboardDecision['dashboardStatus'];
  contentAction: DashboardDecision['contentAction'];
  deviceHealth: DashboardDecision['deviceHealth'];
  publishedEvent: string;
  subscriberTokenIssued: boolean;
  metricsQueryUsed: boolean;
}> {
  const input = creatorDeliveryEventSchema.parse(rawInput);
  const decision = evaluateDashboardStatus(input);
  const channel = buildChannelName(input.creatorId);

  await infrai.realtime.channel.create({
    channel,
    type: 'public'
  });

  await infrai.realtime.publish({
    channel,
    event: decision.eventName,
    account_id: input.creatorId,
    data: {
      message_id: `${input.creatorId}:${input.assetId}:${input.deviceId}:${input.subscriberId}:${input.attempt}`,
      creatorId: input.creatorId,
      assetId: input.assetId,
      deviceId: input.deviceId,
      subscriberId: input.subscriberId,
      dashboardStatus: decision.dashboardStatus,
      contentAction: decision.contentAction,
      deviceHealth: decision.deviceHealth
    }
  });

  await infrai.realtime.token.issue({
    client_id: input.subscriberId,
    channels: [channel],
    capabilities: ['subscribe'],
    ttl_seconds: 900
  });

  const metricsQuery = new URLSearchParams({
    name: 'creator.device.status.changed',
    agg: 'count',
    tags: `creator=${input.creatorId},asset=${input.assetId}`
  }).toString();
  await infrai.metrics.query(`?${metricsQuery}`);

  return {
    channel,
    dashboardStatus: decision.dashboardStatus,
    contentAction: decision.contentAction,
    deviceHealth: decision.deviceHealth,
    publishedEvent: decision.eventName,
    subscriberTokenIssued: true,
    metricsQueryUsed: true
  };
}
