import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_VESSEL_CATEGORY_VISIBILITY,
  VESSEL_CATEGORIES,
  aidToNavigationTypeName,
  isAidToNavigation,
  isVessel,
  nonVesselKind,
  normalizeMmsi,
  vesselCategory,
} from './vesselTypes.js';
import { vesselModelSpec } from './fleetModels.js';

test('an aid-to-navigation type code names its kind of aid', () => {
  assert.equal(aidToNavigationTypeName(20), 'Cardinal Mark N');
  assert.equal(aidToNavigationTypeName('13'), 'Beacon, Port hand');
  assert.equal(aidToNavigationTypeName(2), 'RACON');
  assert.equal(aidToNavigationTypeName(29), 'Safe Water');
  assert.equal(aidToNavigationTypeName(31), 'Light Vessel / LANBY / Rigs');
  // Code 0, a code past 31 and no code name no kind.
  for (const code of [0, 32, -1, '', null, undefined, 'x'])
    assert.equal(aidToNavigationTypeName(code), 'Navigation aid', code);
});

test('aids to navigation are known by their type, else their MMSI', () => {
  for (const type of [
    'Beacon, Special Mark',
    'Cardinal Mark N',
    'Port Hand Mark',
    'Starboard Hand Mark',
    'Safe Water',
    'Isolated danger',
    'Preferred Channel Port hand',
    'RACON',
    'Reference point',
    'Navigation aid',
    'AtoN',
    'Lighthouse',
    'Buoy',
    // Every kind an aid report names is an aid, whatever its MMSI.
    'Light, with sectors',
    'Leading light rear',
    'Emergency wreck marking buoy',
  ])
    assert.equal(isAidToNavigation({ type, mmsi: '' }), true, type);
  // A virtual aid is an aid whatever its type or MMSI.
  assert.equal(
    isAidToNavigation({ type: '', mmsi: '', virtual: true }),
    true,
  );
  // AIS aid-to-navigation stations are numbered 99MIDxxxx.
  assert.equal(isAidToNavigation({ type: '', mmsi: '993672001' }), true);
  assert.equal(isAidToNavigation({ type: '0', mmsi: ' 992351234 ' }), true);
  for (const vessel of [
    { type: 'Buoy Tender', mmsi: '366999001' },
    { type: 'Buoy-Laying Vessel', mmsi: '' },
    { type: 'Buoy Layer', mmsi: '' },
    { type: 'Lighter', mmsi: '' },
    { type: 'Flight deck', mmsi: '' },
    { type: 70, mmsi: 366999002 },
    { type: '70', mmsi: '366999002' },
    { type: '0', mmsi: '' },
    { type: 'Cargo', mmsi: '99' },
    { type: 'Passenger', mmsi: '9936720011' },
    {},
  ])
    assert.equal(isAidToNavigation(vessel), false, JSON.stringify(vessel));
});

test('an MMSI a feed sent as a number gets its leading zeros back', () => {
  // A coast station (00MIDxxxx) loses two zeros, a group (0MIDxxxxx) one.
  assert.equal(normalizeMmsi(2442234), '002442234');
  assert.equal(normalizeMmsi('23661234'), '023661234');
  assert.equal(normalizeMmsi(' 366999712 '), '366999712');
  // Anything shorter or longer is not an MMSI that lost its zeros.
  for (const value of ['99', '123456', '9936720011', 'ABC', ''])
    assert.equal(normalizeMmsi(value), value);
  assert.equal(normalizeMmsi(null), '');
});

test('what is not a vessel is known by its MMSI first, then its words', () => {
  const cases = [
    // MMSI prefixes (ITU-R M.585), padded to nine digits first.
    [{ mmsi: '002442234' }, 'station'],
    [{ mmsi: 2442234 }, 'station'],
    [{ mmsi: '992442234' }, 'aid'],
    [{ mmsi: '111244100' }, 'aircraft'],
    [{ mmsi: '970123456' }, 'beacon'],
    [{ mmsi: '972123456' }, 'beacon'],
    [{ mmsi: '974123456' }, 'beacon'],
    // The prefix overrides the words.
    [{ mmsi: '002442234', type: 'Cargo' }, 'station'],
    [{ mmsi: '992442234', type: 'Manned VTS' }, 'aid'],
    // Words of the detailed type, then the broad one.
    [{ type: 'Manned VTS' }, 'station'],
    [{ type: 'VTS' }, 'station'],
    [{ type: 'Vessel Traffic Service' }, 'station'],
    [{ type: 'AIS Base Station' }, 'station'],
    [{ type: 'Coast Station' }, 'station'],
    [{ type: 'Platform' }, 'platform'],
    [{ type: 'Oil Platform' }, 'platform'],
    [{ type: '', typeBroad: 'Base Station' }, 'station'],
    [{ type: 'Light without sectors' }, 'aid'],
    [{ type: 'Light, without sectors' }, 'aid'],
    [{ type: 'Cardinal Mark N' }, 'aid'],
    // A destination that says it does not move.
    [{ type: '', destination: 'STEADY OBJECT' }, 'platform'],
    [{ type: 'Unknown', destination: ' Steady object ' }, 'platform'],
    // Vessels.
    [{ type: '90', destination: 'STEADY OBJECT' }, null],
    [{ type: '', destination: 'ROTTERDAM STEADY OBJECT' }, null],
    // Aircraft and distress beacons are known by their MMSI only.
    [{ type: 'SAR Aircraft' }, null],
    [{ type: 'EPIRB' }, null],
    // A ship-type code keeps a ship a ship whatever its station, aid or aircraft prefix; a distress beacon's prefix holds.
    [{ mmsi: '2442234', type: '70' }, null],
    [{ mmsi: '992442234', type: '80' }, null],
    [{ mmsi: '111244100', type: '51' }, null],
    [{ mmsi: '974123456', type: '70' }, 'beacon'],
    [{ type: 'Platform Supply Vessel' }, null],
    [{ type: 'Aircraft Carrier' }, null],
    [{ type: 'Buoy Tender' }, null],
    [{ type: '70', mmsi: '366999712' }, null],
    [{ type: 'Cargo', mmsi: '99' }, null],
    // A group ship station (one leading zero) is a vessel.
    [{ mmsi: '023661234' }, null],
    [{ mmsi: 23661234 }, null],
    [{ destination: 'ROTTERDAM' }, null],
    [{}, null],
  ];
  for (const [vessel, kind] of cases) {
    assert.equal(nonVesselKind(vessel), kind, JSON.stringify(vessel));
    assert.equal(isVessel(vessel), kind === null, JSON.stringify(vessel));
    assert.equal(isAidToNavigation(vessel), kind === 'aid');
  }
});

test('seven categories, in panel order, all shown by default', () => {
  assert.deepEqual(VESSEL_CATEGORIES, [
    'tankers',
    'cargo',
    'passenger',
    'fishing',
    'service',
    'leisure',
    'other',
  ]);
  assert.deepEqual(DEFAULT_VESSEL_CATEGORY_VISIBILITY, {
    tankers: true,
    cargo: true,
    passenger: true,
    fishing: true,
    service: true,
    leisure: true,
    other: true,
  });
  const ship = '366999712';
  for (const [vessel, category] of [
    // Service: tugs, offshore and work, government and safety.
    [{ type: 'Tug', mmsi: ship }, 'service'],
    [{ type: '52', mmsi: ship }, 'service'],
    [{ type: 'Offshore Supply Ship', mmsi: ship }, 'service'],
    [{ type: 'Dredger', mmsi: ship }, 'service'],
    [{ type: 'Naval/Naval Auxiliary', mmsi: ship }, 'service'],
    [{ type: 'Search & Rescue', mmsi: ship }, 'service'],
    [{ type: '51', mmsi: ship }, 'service'],
    [{ type: '', mmsi: '111244100' }, 'service'],
    [{ type: '', mmsi: '974123456' }, 'service'],
    // Leisure: sailing and pleasure craft.
    [{ type: 'Sailing Vessel', mmsi: ship }, 'leisure'],
    [{ type: '36', mmsi: ship }, 'leisure'],
    [{ type: '37', mmsi: ship }, 'leisure'],
    // Other: unplaced text, no type, and stations, platforms and aids.
    [{ type: 'Mystery Hull', mmsi: ship }, 'other'],
    [{ type: '', mmsi: ship }, 'other'],
    [{ type: '0', mmsi: ship }, 'other'],
    [{ type: 'Manned VTS', mmsi: ship }, 'other'],
    [{ type: 'Offshore Platform', mmsi: ship }, 'other'],
    [{ type: 'Cardinal Mark N', mmsi: '992442234' }, 'other'],
  ])
    assert.equal(vesselCategory(vessel), category, JSON.stringify(vessel));
});

test('each vessel category from its AIS code and from its words', () => {
  const cases = {
    tankers: [
      '80',
      '84',
      '89',
      'Tanker',
      'Crude Oil Tanker',
      'Oil Products Tanker',
      'Chemical Tanker',
      'Oil/Chemical Tanker',
      'Asphalt/Bitumen Tanker',
      'LNG Tanker',
      'LPG Tanker',
      'Gas Carrier',
      'Bunkering Tanker',
      'FSO',
      'FPSO',
      'Inland, Tanker',
    ],
    cargo: [
      '70',
      '79',
      'Cargo',
      'Bulk Carrier',
      'Container Ship',
      'General Cargo',
      'Reefer',
      'Ro-Ro Cargo',
      'Vehicles Carrier',
      // A carrier of yachts is a cargo ship, not a yacht.
      'Yacht Carrier',
      'Heavy Lift Vessel',
      'Inland, Motor Freighter',
    ],
    passenger: [
      '40',
      '49',
      '60',
      '69',
      'Passenger',
      'Passenger Ship',
      'Cruise Ship',
      'Ferry',
      'Ro-Ro/Passenger Ship',
      'High Speed Craft',
      'HSC',
    ],
    fishing: [
      '30',
      'Fishing',
      'Fishing Vessel',
      'Trawler',
      'Fish Carrier',
      'Fish Factory',
    ],
    service: [
      // Tugs and port service.
      '31',
      '32',
      '50',
      '52',
      '53',
      'Tug',
      'Pusher Tug',
      'Towing Vessel',
      'Pilot Vessel',
      'Port Tender',
      'Icebreaker',
      'Ice Breaker',
      // Offshore and work vessels.
      '33',
      '34',
      '54',
      'Dredger',
      'Hopper Dredger',
      'Diving Ops',
      'Anti-Pollution',
      'Pollution Control Vessel',
      'Offshore Supply Ship',
      'Platform Supply Vessel',
      'Cable Layer',
      'Pipe Layer',
      'Crane Ship',
      'Research/Survey Vessel',
      'Buoy Tender',
      // Government and safety.
      '35',
      '51',
      '55',
      '58',
      '59',
      'Military',
      'Military Ops',
      'Naval/Naval Auxiliary',
      'Patrol Vessel',
      'Coast Guard',
      'Law Enforce',
      'Police',
      'Search & Rescue',
      'SAR',
      'Medical Transport',
      'Aircraft Carrier',
    ],
    leisure: [
      '36',
      '37',
      'Sailing',
      'Sailing Vessel',
      'Pleasure Craft',
      'Yacht',
    ],
    other: [
      '1',
      '20',
      '29',
      '38',
      '39',
      '56',
      '57',
      '90',
      '99',
      'Other',
      'Training Ship',
      'Accommodation Barge',
      'Wing In Ground',
      'Spare',
      'Reserved',
      // A text type no rule places.
      'Mystery Hull',
      // No type at all.
      '',
      '0',
      '100',
      '255',
      'Unknown',
      'Unspecified',
      'N/A',
      null,
      undefined,
    ],
  };
  for (const [category, types] of Object.entries(cases))
    for (const type of types)
      assert.equal(
        vesselCategory({ type, mmsi: '366999712' }),
        category,
        String(type),
      );
  assert.deepEqual(
    new Set(Object.keys(cases)),
    new Set(VESSEL_CATEGORIES),
  );
});

test('the detailed type decides before the broad type and the code', () => {
  // Datalastic's whole record: "Cargo" broadly, an oil products tanker in
  // detail.
  assert.equal(
    vesselCategory({ type: 'Oil Products Tanker', typeBroad: 'Cargo' }),
    'tankers',
  );
  // A detailed type that names nothing falls back on the broad one.
  assert.equal(
    vesselCategory({ type: 'Unknown', typeBroad: 'Tanker' }),
    'tankers',
  );
  assert.equal(
    vesselCategory({ type: 'Mystery Hull', typeBroad: 'Fishing' }),
    'fishing',
  );
  // Words before a numeric code.
  assert.equal(vesselCategory({ type: '70', typeBroad: 'Tug' }), 'service');
  assert.equal(vesselCategory({ type: 'Unknown', typeBroad: '' }), 'other');
});

test('stations, aids, SAR aircraft and distress beacons have their categories', () => {
  for (const vessel of [
    { type: 'Manned VTS' },
    { type: 'Manned VTS', typeBroad: 'Navigation Aid' },
    { mmsi: '2442234', type: '' },
    { type: 'Cardinal Mark N', mmsi: '992442234' },
    { type: 'Light without sectors' },
    { type: 'Platform', destination: 'STEADY OBJECT' },
    { type: 'Isolated danger', virtual: true },
  ])
    assert.equal(vesselCategory(vessel), 'other', JSON.stringify(vessel));
  for (const mmsi of ['111244100', '970123456', '972123456', '974123456'])
    assert.equal(vesselCategory({ mmsi, type: '' }), 'service', mmsi);
  // Nothing is hidden until asked for.
  assert.deepEqual(
    Object.entries(DEFAULT_VESSEL_CATEGORY_VISIBILITY)
      .filter(([, shown]) => !shown)
      .map(([category]) => category),
    [],
  );
});

test('platforms are their own kind', () => {
  for (const vessel of [
    { type: 'Offshore Platform' },
    { type: 'Platform' },
    { type: 'Oil Platform' },
    { type: 'Drilling Rig' },
    { type: 'Jack-up Rig' },
    { type: 'OffShore Structure' },
    // The aid kinds of type codes 3 and 31, on no MMSI or an aid's.
    { type: aidToNavigationTypeName(3) },
    { type: aidToNavigationTypeName(31) },
    { type: aidToNavigationTypeName(3), mmsi: '993672001' },
    { type: aidToNavigationTypeName(31), mmsi: '992442234' },
    // A destination that says it does not move.
    { destination: 'STEADY OBJECT' },
    { type: 'Unknown', destination: ' Steady object ' },
  ]) {
    assert.equal(nonVesselKind(vessel), 'platform', JSON.stringify(vessel));
    assert.equal(isVessel(vessel), false, JSON.stringify(vessel));
    assert.equal(isAidToNavigation(vessel), false, JSON.stringify(vessel));
    assert.equal(vesselCategory(vessel), 'other', JSON.stringify(vessel));
  }
});

test('a lightship, light vessel or LANBY is an aid on an aid MMSI or none', () => {
  for (const type of [
    'Lightship',
    'Light Vessel',
    'Lightvessel',
    'Light-Vessel',
    'LANBY',
  ])
    for (const mmsi of ['', '993672001']) {
      const vessel = { type, mmsi };
      assert.equal(nonVesselKind(vessel), 'aid', JSON.stringify(vessel));
      assert.equal(isAidToNavigation(vessel), true, JSON.stringify(vessel));
    }
  // A vessel that works on one is a ship.
  for (const type of ['Lightship Tender', 'LANBY Tender'])
    assert.equal(nonVesselKind({ type }), null, type);
});

test('a virtual fixed-structure aid is a platform with no model', () => {
  const set = {
    catalog: JSON.parse(
      fs.readFileSync(
        new URL('../../public/models/fleet/catalog.json', import.meta.url),
        'utf8',
      ),
    ),
    types: {},
  };
  for (const code of [3, 31]) {
    const aid = {
      type: aidToNavigationTypeName(code),
      mmsi: '993672001',
      virtual: true,
    };
    assert.equal(nonVesselKind(aid), 'platform', aid.type);
    assert.equal(nonVesselKind({ ...aid, mmsi: '' }), 'platform', aid.type);
    // However a feed spaces or punctuates the kind's name.
    const respelled = aid.type.replaceAll(' / ', '/').replaceAll(' ', '  ');
    assert.equal(
      nonVesselKind({ ...aid, type: respelled }),
      'platform',
      respelled,
    );
    assert.equal(vesselModelSpec(set, aid), null, aid.type);
  }
  // Any other virtual aid stays an aid.
  assert.equal(
    nonVesselKind({
      type: 'Cardinal Mark N',
      mmsi: '993672001',
      virtual: true,
    }),
    'aid',
  );
});

test('platform supply vessels stay ships', () => {
  for (const type of [
    'Platform Supply Vessel',
    'Platform Supply Ship',
    'Rig Supply Vessel',
    'Jack Up Vessel',
    'Light Vessel Tender',
    'Jack Up Barge',
    'Jack-Up Barge',
    'Rig Mover',
    'Anchor Handling Rig',
    'Rig Anchor Handling',
  ]) {
    assert.equal(nonVesselKind({ type }), null, type);
    assert.equal(isVessel({ type }), true, type);
  }
});

test('a ship-type code beats platform words', () => {
  for (const vessel of [
    { type: 'Platform', typeBroad: '70' },
    { type: '70', typeBroad: 'Offshore Platform' },
    { type: 'Drilling Rig', typeBroad: '33' },
    { type: '90', destination: 'STEADY OBJECT' },
  ]) {
    assert.equal(nonVesselKind(vessel), null, JSON.stringify(vessel));
    assert.equal(isVessel(vessel), true, JSON.stringify(vessel));
  }
});

test('a helicopter landing platform is a station', () => {
  for (const type of ['Helicopter Landing Platform', 'Helipad', 'Heliport'])
    assert.equal(nonVesselKind({ type }), 'station', type);
});

// A broad non-vessel type does not overrule a detailed type that names a
// working vessel.
const SHIP = '244123456';
const classes = (v) => [nonVesselKind(v), isVessel(v), vesselCategory(v)];

test('a detailed worker-vessel type beats a broad non-vessel label', () => {
  for (const type of ['Buoy Tender', 'Platform Supply Vessel']) {
    const alone = classes({ type, mmsi: SHIP });
    assert.deepEqual(alone, [null, true, 'service'], type);
    for (const typeBroad of ['Navigation Aid', 'Platform'])
      assert.deepEqual(
        classes({ type, typeBroad, mmsi: SHIP }),
        alone,
        `${type} + ${typeBroad}`,
      );
  }
});

test('a leisure type still names a vessel beside a broad aid or platform', () => {
  for (const type of ['Sailing Vessel', 'Pleasure Craft', 'Yacht'])
    for (const typeBroad of ['Navigation Aid', 'Platform']) {
      const vessel = { type, typeBroad, mmsi: SHIP };
      assert.deepEqual(classes(vessel), [null, true, 'leisure'], typeBroad);
    }
});

test('an unrecognised detailed type still falls back to the broad label', () => {
  assert.equal(
    nonVesselKind({ type: 'Unknown', typeBroad: 'Navigation Aid', mmsi: SHIP }),
    'aid',
  );
  assert.equal(
    nonVesselKind({ type: 'Zorbx', typeBroad: 'Platform', mmsi: SHIP }),
    'platform',
  );
  // A station MMSI still wins over the detailed ship description.
  assert.equal(
    nonVesselKind({ type: 'Platform Supply Vessel', mmsi: '002442234' }),
    'station',
  );
});

// A crew-entered destination does not turn a contact with a ship type into a
// station.
test('a typed cargo ship stays cargo whatever its destination says', () => {
  for (const type of ['Cargo', '70'])
    for (const destination of [
      '',
      'STEADY OBJECT',
      'ROTTERDAM STEADY OBJECT X',
    ]) {
      const v = { type, mmsi: SHIP, destination };
      assert.equal(isVessel(v), true, JSON.stringify(v));
      assert.equal(vesselCategory(v), 'cargo', JSON.stringify(v));
    }
});

test('a typed platform and an untyped exact placeholder are platforms', () => {
  for (const vessel of [
    { type: 'Oil Platform', mmsi: SHIP },
    { type: '', mmsi: SHIP, destination: 'STEADY OBJECT' },
  ]) {
    assert.equal(nonVesselKind(vessel), 'platform', JSON.stringify(vessel));
    assert.equal(vesselCategory(vessel), 'other', JSON.stringify(vessel));
  }
});

// Tanker subtypes without the word "tanker" land in Tankers.
test('tanker subtypes are tankers', () => {
  assert.equal(
    vesselCategory({ type: 'Tank Barge', typeBroad: 'Tanker' }),
    'tankers',
  );
  assert.equal(
    vesselCategory({ type: 'Crude Oil', typeBroad: 'Cargo' }),
    'tankers',
  );
});

test('a bulk carrier and an accommodation barge are not tankers', () => {
  assert.equal(
    vesselCategory({ type: 'Bulk Carrier', typeBroad: 'Cargo' }),
    'cargo',
  );
  assert.equal(
    vesselCategory({ type: 'Accommodation Barge', typeBroad: 'Other' }),
    'other',
  );
});
