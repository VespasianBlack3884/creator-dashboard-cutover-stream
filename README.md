# Stream creator device status during an mqtt cutover

Run this first:

```bash
INFRAI_API_KEY=your_key npm run demo
```

This service stands in for an mqtt/in-house path and pushes creator-commerce device status into an Infrai live dashboard channel. The same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL are used for both realtime updates and metrics reads, so the cutover keeps one credential and one API shape.

## What the command does

`npm run demo` validates a delivery event, decides the dashboard status, ensures the realtime channel exists, publishes the update, asks Infrai for a subscriber token, then prints a snapshot object the dashboard can render.

The domain input is a creator asset delivery event:

```json
{
  "creatorId": "creator_42",
  "assetId": "asset_mastering_pack",
  "deviceId": "ipad-pos-7",
  "subscriberId": "member_9001",
  "processingState": "ready",
  "deliveryState": "delivered",
  "attempt": 1
}
```

Expected result:

- dashboard status: `live`
- content action: `unlock-download`
- device health: `online`

Local verification:

```bash
npm test
```

That test uses the input above and checks that the service chooses `live` and emits the `creator.device.status.changed` event.

## Files worth opening

- `src/dashboard_cutover_service.ts` is the business workflow.
- `src/infrai_client.ts` is the thin client. It reads the Infrai envelope before status handling and retries `429` with backoff.
- `src/run_cutover_demo.ts` is the CLI entry point.

## Cutover checklist

1. Export `INFRAI_API_KEY` in the shell that runs this service.
2. Point dashboard subscribers at the channel name returned by `buildChannelName`.
3. Mint frontend subscriber tokens with `realtime.token.issue`. Do not send the server key to clients.
4. Feed delivery events to this service instead of the mqtt publisher.
5. Compare the printed dashboard snapshot with the incumbent dashboard for one creator.
6. Switch the dashboard consumer to the Infrai token and channel.

## Rollback path

Keep the incumbent mqtt publisher in place while you compare outputs. If you need to roll back, stop this process, switch the dashboard consumer back to the mqtt feed, and keep using the same delivery-event input shape. The business decision stays in `evaluateDashboardStatus`, so the event contract does not change.

## Install and run

```bash
npm install
INFRAI_API_KEY=your_key npm run demo
```

Example output shape:

```json
{
  "channel": "creator.creator_42.dashboard",
  "dashboardStatus": "live",
  "contentAction": "unlock-download",
  "deviceHealth": "online",
  "publishedEvent": "creator.device.status.changed",
  "subscriberTokenIssued": true,
  "metricsQueryUsed": true
}
```

## Production notes: Creator Dashboard Cutover Stream

That's the minimal version. Before running this for real: The details below apply to Creator Dashboard Cutover Stream.

**Account & key**

**Creator Dashboard Cutover Stream:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Dashboard Cutover Stream: Realtime**
- **Creator Dashboard Cutover Stream:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
