// A capped snapshot keeps a fresh distress beacon even when the cache holds as
// many fresh ships as the cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from './ais-store.js';

let now = Date.parse('2032-01-01T00:00:00Z');
const position = (mmsi, lat) =>
  store.ingestAisStreamEnvelope({
    MessageType: 'PositionReport',
    Message: { PositionReport: { UserID: mmsi, Sog: 5, Cog: 1 } },
    MetaData: {
      MMSI: mmsi,
      latitude: lat,
      longitude: 4,
      time_utc: new Date(now).toISOString(),
    },
  });

test('fresh beacon at row cap', (t) => {
  now += store.AISSTREAM_STALE_MS + 60_000;
  t.mock.method(Date, 'now', () => now);
  for (let i = 0; i < 12000; i++) position(244000000 + i, 50 + i / 1e4);
  now += 1000;
  position(974123456, 51);
  assert.ok(store.aisStreamRows(12001).some((r) => r.mmsi === '974123456'));
  const capped = store.aisStreamRows(12000);
  assert.ok(capped.length <= 12000);
  assert.ok(
    capped.some((r) => r.mmsi === '974123456'),
    'beacon cut by the cap',
  );
});
