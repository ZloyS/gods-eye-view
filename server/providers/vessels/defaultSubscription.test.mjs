// The default AISStream subscription names base-station and SAR-aircraft
// reports, and the store turns a base-station report into a station row.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from './ais-store.js';
import { nonVesselKind } from '../../../src/data/vesselTypes.js';

test('default subscription names the station and SAR reports', () => {
  const source = fs.readFileSync(
    fileURLToPath(new URL('./ais-live.js', import.meta.url)),
    'utf8',
  );
  const list = source.match(
    /AISSTREAM_DEFAULT_MESSAGE_TYPES = \[([\s\S]*?)\];/,
  )[1];
  assert.match(list, /'BaseStationReport'/);
  assert.match(list, /'StandardSearchAndRescueAircraftReport'/);
});

test('a base station report becomes a station row', (t) => {
  const now = Date.parse('2033-01-01T00:00:00Z');
  t.mock.method(Date, 'now', () => now);
  store.ingestAisStreamEnvelope({
    MessageType: 'BaseStationReport',
    Message: {
      BaseStationReport: { UserID: 2442234, Latitude: 5, Longitude: 5 },
    },
    MetaData: {
      MMSI: 2442234,
      latitude: 5,
      longitude: 5,
      time_utc: new Date(now).toISOString(),
    },
  });
  const row = store.aisStreamRows(10).find((r) => r.mmsi === '002442234');
  assert.equal(nonVesselKind(row), 'station');
});
