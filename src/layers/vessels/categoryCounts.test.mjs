// The live count on each vessel category chip, and the Context split by
// category that names the same categories with the same counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { observation, setupVesselLayer } from './vesselLayerFixture.mjs';
import { layerBreakdown } from '../../data/entityContext.js';

/** Two tankers, a cargo ship, a fishing boat and a coast station. */
const FLEET = [
  observation('366000001', { type: '80' }),
  observation('366000002', { type: '84' }),
  observation('366000003', { type: '70' }),
  observation('366000004', { type: '30' }),
  observation('002442234', { type: '' }),
];

const chipCounts = (layer) =>
  Object.fromEntries(
    layer
      .getRowControls()
      .chips.map((chip) => [chip.id.replace('vessels-', ''), chip.count]),
  );

test('a shown chip carries its category count; a hidden or empty one none', async () => {
  const { layer } = await setupVesselLayer(FLEET);
  const counts = chipCounts(layer);
  assert.equal(counts.tankers, 2);
  assert.equal(counts.cargo, 1);
  assert.equal(counts.fishing, 1);
  // No passenger ship in the snapshot: no count.
  assert.equal(counts.passenger, undefined);
  // The coast station is Other, shown by default.
  assert.equal(counts.other, 1);
  assert.equal(layer.getStats().count, 5);
  // A hidden chip carries no count, as a hidden Flights chip.
  layer.setParams({ other: false });
  assert.equal(chipCounts(layer).other, undefined);
  assert.equal(layer.getStats().count, 4);
  layer.setParams({ tankers: false });
  assert.equal(chipCounts(layer).tankers, undefined);
  assert.equal(chipCounts(layer).cargo, 1);
  assert.equal(layer.getStats().count, 2);
});

test('a poll that changes the counts paints the row again; one that does not, not', async () => {
  let invalidations = 0;
  const panel = { invalidate: () => (invalidations += 1) };
  const { layer, refresh } = await setupVesselLayer(FLEET, { panel });
  assert.ok(invalidations > 0, 'the first snapshot paints its counts');
  invalidations = 0;
  await refresh(
    FLEET.map((row) => ({ ...row, observedAtMs: 600 })),
    600,
  );
  assert.equal(invalidations, 0, 'same counts, no repaint');
  // A tanker turns cargo ship and a new fishing boat comes.
  await refresh(
    [
      ...FLEET.slice(0, 1),
      observation('366000002', { type: '70', observedAtMs: 700 }),
      ...FLEET.slice(2),
      observation('366000005', { type: '30', observedAtMs: 700 }),
    ].map((row) => ({ ...row, observedAtMs: 700 })),
    700,
  );
  assert.ok(invalidations > 0, 'new counts repaint the row');
  const counts = chipCounts(layer);
  assert.equal(counts.tankers, 1);
  assert.equal(counts.cargo, 2);
  assert.equal(counts.fishing, 2);
  assert.equal(layer.getStats().count, 6);
});

test('the Context split by category names the chips with their counts', async () => {
  const { layer } = await setupVesselLayer([
    ...FLEET,
    // Typed by its broad type only, a virtual aid, a SAR aircraft.
    observation('366000006', { type: '', typeBroad: 'Cargo' }),
    observation('366000007', { type: '', virtual: true }),
    observation('111244100', { type: '' }),
  ]);
  const data = {
    layers: new Map([['ais-live-vessels', { module: layer }]]),
    isEnabled: () => true,
  };
  const breakdown = layerBreakdown(data, 'ais-live-vessels');
  assert.equal(breakdown.total, 8);
  const [category, type] = breakdown.splits;
  assert.equal(category.title, 'Category');
  assert.equal(type.title, 'Type');
  const byLabel = Object.fromEntries(
    category.parts.map((part) => [part.label, part.count]),
  );
  const chips = layer.getRowControls().chips.filter((chip) => chip.count);
  // Every shown category has its own row with its chip's count.
  assert.equal(category.parts.length, chips.length);
  for (const part of category.parts)
    assert.equal(
      chips.find((chip) => chip.label === part.label.toUpperCase())?.count,
      part.count,
      part.label,
    );
  assert.equal(byLabel.Other, 2);
  assert.equal(byLabel.Service, 1);
  assert.equal(byLabel.Cargo, 2);
  assert.equal(byLabel.Tankers, 2);
  // A hidden category's records are not handed out: it is not in the split.
  layer.setParams({ other: false });
  const hidden = layerBreakdown(data, 'ais-live-vessels');
  assert.equal(hidden.total, 6);
  assert.ok(!hidden.splits[0].parts.some((part) => part.label === 'Other'));
});

test('the Context Other row is the Other chip, with no tail folded in', async () => {
  const types = ['90', '90', '90', '70', '70', '70', '80', '80', '80'];
  const { layer } = await setupVesselLayer([
    ...types.map((type, index) => observation(`3660001${index}0`, { type })),
    observation('366000200', { type: '30' }),
    observation('366000201', { type: '30' }),
    observation('366000202', { type: '30' }),
    observation('366000203', { type: '60' }),
    observation('366000204', { type: '52' }),
    // A pleasure craft is Leisure; no type joins Other.
    observation('366000205', { type: '37' }),
    observation('366000206', { type: '' }),
  ]);
  const data = {
    layers: new Map([['ais-live-vessels', { module: layer }]]),
    isEnabled: () => true,
  };
  const [category] = layerBreakdown(data, 'ais-live-vessels').splits;
  const byLabel = Object.fromEntries(
    category.parts.map((part) => [part.label, part.count]),
  );
  const chips = chipCounts(layer);
  assert.equal(chips.other, 4);
  assert.equal(chips.leisure, 1);
  assert.equal(byLabel.Other, chips.other);
  assert.equal(category.parts.length, 7);
});
