// The card and HUD text of what is not a vessel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, setupVesselLayer } from './vesselLayerFixture.mjs';

// The ambient card of a contact known only by its MMSI prefix names its kind,
// as its selected card does.
test('ambient cards of prefix-only contacts name their kind', async () => {
  const { layer, record } = await setupVesselLayer([
    observation('974123456', { type: '' }),
    observation('111244100', { type: '' }),
    observation('002442234', { type: '' }),
  ]);
  const ambient = (id) => layer.buildVesselCard(record(id)).details;
  assert.deepEqual(ambient('974123456'), ['DISTRESS BEACON · EPIRB']);
  assert.deepEqual(ambient('002442234'), ['COAST STATION']);
  assert.match(ambient('111244100')[0] ?? '', /^SAR AIRCRAFT · .*KT · 180°$/);
});

test('an explicit station type keeps its own text on its ambient card', async () => {
  const { layer, record } = await setupVesselLayer([
    observation('366999004', { type: 'Manned VTS', speedMps: 0 }),
  ]);
  assert.deepEqual(layer.buildVesselCard(record('366999004')).details, [
    'MANNED VTS',
  ]);
});

// A distress beacon whose type text says "Unknown" or names a ship still reads
// as a distress beacon on its card and HUD.
for (const type of ['Unknown', 'Cargo'])
  test(`a 974 beacon typed ${type} reads DISTRESS BEACON · EPIRB`, async () => {
    const { layer, log, record } = await setupVesselLayer([
      observation('974123457', { type }),
    ]);
    assert.equal(
      layer.buildSelectedVesselCard(record('974123457')).details[0],
      'DISTRESS BEACON · EPIRB',
    );
    assert.equal(layer.selectById('974123457'), true);
    assert.match(
      log.hud.filter(Boolean).at(-1).text,
      /DISTRESS BEACON · EPIRB/,
    );
  });

test('a beacon whose type text is EPIRB keeps it', async () => {
  const { layer, record } = await setupVesselLayer([
    observation('974123459', { type: 'EPIRB' }),
  ]);
  assert.equal(
    layer.buildSelectedVesselCard(record('974123459')).details[0],
    'EPIRB',
  );
});

// The HUD keeps the whole device name of an AIS-SART.
test('the HUD names an AIS-SART in full', async () => {
  const { layer, log, record } = await setupVesselLayer([
    observation('970123456', { type: '' }),
  ]);
  assert.equal(layer.selectById('970123456'), true);
  assert.match(
    layer.buildSelectedVesselCard(record('970123456')).details[0],
    /AIS-SART/,
  );
  assert.match(
    log.hud.filter(Boolean).at(-1).text,
    /DISTRESS BEACON · AIS-SART/,
  );
});
