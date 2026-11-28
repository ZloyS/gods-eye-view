import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAircraft, aircraftCategory } from './aircraftClass.js';

test('An-140 category: the A140 twin turboprop follows Regional', () => {
  const klass = classifyAircraft({ typeCode: 'A140', category: 0 });
  assert.equal(klass, 'turboprop');
  assert.equal(aircraftCategory(klass), 'regional');
});
