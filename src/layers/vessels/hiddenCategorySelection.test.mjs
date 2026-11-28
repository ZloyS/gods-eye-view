// Id- and name-based paths must not select or follow a vessel whose
// category is hidden: its card would draw with no icon under it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { north, observation, setupVesselLayer } from './vesselLayerFixture.mjs';

test('a hidden category is not selected by id, name or track', async () => {
  const { layer, icons, publishedCards } = await setupVesselLayer([
    observation('244000001', {
      name: 'T OILPROD',
      type: 'Oil Products Tanker',
      typeBroad: 'Cargo',
    }),
    observation('366000002', { latitude: north(1), type: '70' }),
  ]);
  layer.setParams({ tankers: false });
  assert.equal(icons.item('244000001').show, false);
  assert.equal(layer.findByQuery('OILPROD'), null);
  assert.equal(layer.findByQuery('244000001'), null);
  assert.equal(layer.selectById('244000001'), false);
  assert.equal(layer.getSelectedInfo(), null);
  assert.deepEqual(publishedCards(), []);
  assert.equal(layer.pickById('244000001', { center: false }), false);
  assert.equal(layer.pickById('244000001'), false);
  assert.equal(layer.getSelectedInfo(), null);
  // A visible selection survives a track request for the hidden tanker.
  assert.equal(layer.selectById('366000002'), true);
  assert.equal(layer.trackById('244000001'), false);
  assert.equal(layer.getSelectedInfo()?.id, '366000002');
  // Shown again, it can be selected.
  layer.setParams({ tankers: true });
  assert.equal(layer.selectById('244000001'), true);
});
