import { InfraiClient } from './infrai_client.js';
import { streamCreatorDashboardCutover } from './dashboard_cutover_service.js';

async function main(): Promise<void> {
  const infrai = InfraiClient.fromEnv();

  const result = await streamCreatorDashboardCutover(infrai, {
    creatorId: 'creator_42',
    assetId: 'asset_mastering_pack',
    deviceId: 'ipad-pos-7',
    subscriberId: 'member_9001',
    processingState: 'ready',
    deliveryState: 'delivered',
    attempt: 1
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
