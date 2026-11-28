// Leaving the bridge of a ship whose category was hidden during the ride
// must not bring back its card over a hidden icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, setupVesselLayer } from './vesselLayerFixture.mjs';

test('bridge release clears a ship whose category was hidden during the ride', async () => {
  const { layer, icons, publishedCards } = await setupVesselLayer([
    observation('366000020', { type: '80' }),
  ]);
  layer.selectById('366000020');
  layer.setCockpitSubject('366000020');
  layer.setParams({ tankers: false });
  // Held while ridden, as intended.
  assert.equal(layer.getSelectedInfo()?.id, '366000020');
  layer.setCockpitSubject(null);
  assert.equal(icons.item('366000020').show, false);
  assert.equal(layer.getSelectedInfo(), null);
  assert.deepEqual(publishedCards(), []);
});

test('bridge release of a visible ship keeps its selection', async () => {
  const { layer, publishedCards } = await setupVesselLayer([
    observation('366000021', { type: '80' }),
  ]);
  layer.selectById('366000021');
  layer.setCockpitSubject('366000021');
  layer.setCockpitSubject(null);
  assert.equal(layer.getSelectedInfo()?.id, '366000021');
  assert.deepEqual(publishedCards(), ['vessel:366000021']);
});
