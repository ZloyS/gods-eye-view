// A landing platform dock is a ship; an oil platform is a platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonVesselKind, isVessel, vesselCategory } from './vesselTypes.js';

test('landing platform dock is a ship, an oil platform is a platform', () => {
  const lpd = { type: 'Landing Platform Dock', mmsi: '232001235' };
  assert.equal(isVessel(lpd), true);
  assert.equal(nonVesselKind(lpd), null);
  assert.equal(
    nonVesselKind({ type: 'Oil Platform', mmsi: '232001236' }),
    'platform',
  );
  assert.equal(
    isVessel({ type: 'Platform Supply Vessel', mmsi: '232001237' }),
    true,
  );
});
