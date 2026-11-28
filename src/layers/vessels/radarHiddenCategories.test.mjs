// Bridge radar must leave out hidden categories, as the map does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { north, observation, setupVesselLayer } from './vesselLayerFixture.mjs';

test('bridge radar leaves out hidden categories before its cap', async () => {
  const { layer } = await setupVesselLayer([
    observation('366999004', {
      latitude: north(1),
      type: 'Manned VTS',
      speedMps: 0,
    }),
    observation('366000002', { latitude: north(2), type: '70' }),
    observation('366000003', { latitude: north(0.3), type: '80' }),
  ]);
  const ids = (cap) =>
    layer.getRadarContacts(54.5, 10.2, 6000, cap).map((c) => c.id);
  // With Other hidden, the VTS station is not drawn.
  layer.setParams({ other: false });
  assert.deepEqual(ids(3), ['366000003', '366000002']);
  layer.setParams({ tankers: false });
  // The hidden tanker must not take the only slot from the visible cargo ship.
  assert.deepEqual(ids(1), ['366000002']);
  layer.setParams({ tankers: true });
  assert.deepEqual(ids(1), ['366000003']);
});
