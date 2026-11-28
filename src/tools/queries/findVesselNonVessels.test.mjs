// find_vessel must not return or count what vessels_in_area leaves out:
// stations, navigation aids, SAR aircraft and distress beacons.
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeCatalog, coreTools } from '../index.js';

const vessel = (id, latitude, longitude, extra = {}) => ({
  id,
  mmsi: id,
  reference: id,
  latitude,
  longitude,
  name: `SHIP ${id}`,
  imo: '',
  type: 'Cargo',
  destination: '',
  speedMps: 6.17,
  courseDeg: 181.2,
  headingDeg: 180,
  observedAtMs: Date.UTC(2026, 0, 1),
  altitudeDatum: 'sea-surface',
  ...extra,
});
const catalogOf = (records) =>
  composeCatalog({
    tools: coreTools,
    services: {
      vessels: {
        async getSnapshot() {
          return {
            records,
            source: 'AISStream',
            observedAtMs: Date.UTC(2026, 0, 1),
            freshness: 'current',
          };
        },
        async getTrack() {
          return { records: [] };
        },
      },
    },
  });
const bay = { lat: 37.78, lon: -122.4, radius_km: 20 };

test('find_vessel leaves out stations and aids, as vessels_in_area does', async () => {
  const catalog = catalogOf([
    // The station arrives first, so a limit of one would take it.
    vessel('366999713', 37.8, -122.42, {
      name: 'HARBOR VTS',
      imo: '1234567',
      type: 'Manned VTS',
      typeBroad: 'Navigation Aid',
    }),
    vessel('366000001', 37.79, -122.41, { name: 'HARBOR TRADER' }),
    vessel('992442234', 37.78, -122.4, { name: 'BUOY 1', type: '' }),
  ]);
  const area = await catalog.call('vessels_in_area', { area: bay });
  assert.equal(area.data.total, 1);
  for (const args of [
    { name: 'HARBOR VTS' },
    { mmsi: '366999713' },
    { imo: '1234567' },
    { mmsi: '992442234' },
  ]) {
    const result = await catalog.call('find_vessel', args);
    assert.equal(result.data.total, 0, JSON.stringify(args));
    assert.equal(result.data.view, null, JSON.stringify(args));
    assert.match(result.summary, /^No vessel/, JSON.stringify(args));
  }
  for (const limit of [undefined, 1]) {
    const shared = await catalog.call('find_vessel', {
      name: 'HARBOR',
      ...(limit && { limit }),
    });
    assert.equal(shared.data.total, 1);
    assert.deepEqual(
      shared.data.rows.map((row) => row.mmsi),
      ['366000001'],
    );
  }
  // A ship is still found.
  const ship = await catalog.call('find_vessel', { mmsi: '366000001' });
  assert.equal(ship.data.total, 1);
});
