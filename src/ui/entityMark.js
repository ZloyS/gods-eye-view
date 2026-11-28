/**
 * @module entityMark
 * @description What Context marks an item with: the sprite the map draws it
 * with, for the layers that draw one per kind (aircraft by class, airport
 * vehicles and ground stations, vessels by type and the buoy of an aid to
 * navigation), or else its layer's glyph (`entityKind` in entityContext.js).
 */

import { isAircraftLayer } from '../data/aircraftLayerIds.js';
import {
  AIRCRAFT_CLASS_LABELS,
  classifyAircraft,
} from '../data/aircraftClass.js';
import { aircraftIcon } from '../data/aircraftIcons.js';
import { nonVesselSprite, vesselSprite } from '../data/vesselSprites.js';
import { nonVesselKind, vesselKind } from '../data/vesselTypes.js';

const VESSEL_LAYERS = new Set(['ais-live-vessels']);
const AIRCRAFT_KINDS = new Set(Object.keys(AIRCRAFT_CLASS_LABELS));
/** The kind an aid to navigation is marked as: the map's buoy. */
export const AID_MARK = 'aid';
/**
 * What a vessel layer's record that is not a vessel is marked as, by its
 * kind (`nonVesselKind`): the map's buoy, station mast, platform or aircraft.
 */
const NON_VESSEL_MARKS = new Set([
  AID_MARK,
  'station',
  'platform',
  'aircraft',
  'beacon',
]);

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim();

/**
 * The sprite kind of an item, read from its layer record as the map picks
 * it: an aircraft's class (its own `aircraftClass`, else worked out from its
 * type), a vessel's kind, or what it is when it is not a vessel ({@link
 * AID_MARK}, `station`, `platform`, `aircraft` or `beacon`). Empty for a
 * layer that draws no sprite per kind.
 */
export function markKind(layerId, source) {
  if (!source) return '';
  if (isAircraftLayer(layerId)) {
    const own = text(source.aircraftClass);
    if (AIRCRAFT_KINDS.has(own)) return own;
    return classifyAircraft({
      typeCode: text(source.typeCode ?? source.type),
      category: source.category ?? null,
    });
  }
  if (VESSEL_LAYERS.has(layerId)) {
    const type = source.shipType ?? source.type;
    const mark = nonVesselKind({
      type,
      typeBroad: source.typeBroad,
      mmsi: source.mmsi,
      destination: source.destination,
      virtual: source.virtual,
    });
    return mark ?? vesselKind(type);
  }
  return '';
}

/**
 * The map sprite as an SVG data URI. Unknown kinds use the map's airliner
 * or default hull. Layers without sprites return an empty string.
 */
export function markSprite(layerId, kind = '') {
  if (isAircraftLayer(layerId))
    return aircraftIcon(AIRCRAFT_KINDS.has(kind) ? kind : 'airliner');
  if (!VESSEL_LAYERS.has(layerId)) return '';
  return NON_VESSEL_MARKS.has(kind)
    ? nonVesselSprite(kind)
    : vesselSprite(kind);
}
