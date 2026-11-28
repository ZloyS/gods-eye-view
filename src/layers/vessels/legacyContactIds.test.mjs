// A contact keyed by its padded MMSI is still found by the 7- or 8-digit id an
// older link carries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, setupVesselLayer } from './vesselLayerFixture.mjs';

test('shortened ids find the padded contact', async () => {
  const { layer } = await setupVesselLayer([
    observation('002442234', { type: '' }),
    observation('023661234', { type: '70' }),
  ]);
  for (const [legacy, padded] of [
    ['2442234', '002442234'],
    ['23661234', '023661234'],
  ]) {
    assert.equal(layer.hasContact(padded), true, padded);
    assert.equal(layer.hasContact(legacy), true, legacy);
    assert.equal(layer.selectById(legacy), true, legacy);
    assert.equal(layer.getSelectedInfo()?.id, padded);
  }
});

test('an exact provider id still wins over a shortened one', async () => {
  const { layer } = await setupVesselLayer([
    observation('002442234', { type: '' }),
    observation('2442234', { type: '70', mmsi: '' }),
  ]);
  assert.equal(layer.selectById('2442234'), true);
  assert.equal(layer.getSelectedInfo()?.id, '2442234');
});
