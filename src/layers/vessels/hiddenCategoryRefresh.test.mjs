// A feed refresh that moves the selected contact into a hidden category
// must clear its inspection, as hiding the category does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, setupVesselLayer } from './vesselLayerFixture.mjs';
import {
  aidSprite,
  platformSprite,
  vesselSprite,
} from '../../data/vesselSprites.js';

test('a selected contact reclassified into a hidden category lets go', async () => {
  const { layer, icons, log, refresh, publishedCards } = await setupVesselLayer(
    [observation('366000010', { type: '' })],
  );
  layer.setParams({ tankers: false });
  assert.equal(layer.selectById('366000010'), true);
  await refresh(
    [observation('366000010', { type: '80', observedAtMs: 600 })],
    600,
  );
  assert.equal(icons.item('366000010').show, false);
  assert.equal(layer.getSelectedInfo(), null);
  assert.equal(log.hud.at(-1), null);
  assert.deepEqual(publishedCards(), []);
});

test('a reclassified contact a visible category takes stays selected', async () => {
  const { layer, refresh } = await setupVesselLayer([
    observation('366000011', { type: '' }),
  ]);
  layer.setParams({ tankers: false });
  layer.selectById('366000011');
  await refresh(
    [observation('366000011', { type: '70', observedAtMs: 600 })],
    600,
  );
  assert.equal(layer.getSelectedInfo()?.id, '366000011');
});

test('a contact whose type fields change is drawn and counted as its new kind', async () => {
  const { layer, icons, refresh } = await setupVesselLayer([
    observation('366999030', { type: 'Cargo' }),
  ]);
  const steps = [
    [{ type: 'Offshore Platform' }, platformSprite(), false],
    [{ type: '', typeBroad: 'Navigation Aid' }, aidSprite(), false],
    [{ type: 'Cargo', mmsi: '992440001' }, aidSprite(), false],
    [{ type: '', destination: 'STEADY OBJECT' }, platformSprite(), false],
    [{ type: 'Cargo', virtual: true }, aidSprite(), false],
    [{ type: 'Cargo' }, vesselSprite('cargo'), true],
  ];
  let t = 600;
  for (const [extra, image, vessel] of steps) {
    const message = JSON.stringify(extra);
    await refresh([observation('366999030', { ...extra, observedAtMs: t })], t);
    t += 100;
    const item = icons.item('366999030');
    assert.equal(item.image, image, message);
    assert.equal(item.rotationMode, vessel ? 'course' : 'screen', message);
    // What is not a vessel is Other: hidden with it, a cargo ship is not.
    layer.setParams({ other: false });
    assert.equal(icons.item('366999030').show, vessel, message);
    assert.equal(layer.getStats().count, vessel ? 1 : 0, message);
    layer.setParams({ other: true });
  }
});
