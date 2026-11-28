import { VESSEL_KIND_STYLES } from './vesselTypes.js';

/**
 * The English name of each vessel category (`VESSEL_CATEGORIES` in
 * vesselTypes.js): the vessels row's chips and the Context split. Both show
 * it through t() with the context below, so a chip reads as a plural
 * category name in every language, apart from the card's ship type words
 * (ru «Грузовые», not «Грузовое»).
 */
export const VESSEL_CATEGORY_LABELS = Object.freeze({
  tankers: 'Tankers',
  cargo: 'Cargo',
  passenger: 'Passenger',
  fishing: 'Fishing',
  service: 'Service',
  leisure: 'Leisure',
  other: 'Other',
});

/** The t() context of the category names. */
export const VESSEL_CATEGORY_CONTEXT = 'vessel category';

/**
 * Each category's chip colour: the map colour of the vessel kind it holds
 * (`VESSEL_KIND_STYLES`), so a chip's dot matches its ships.
 */
export const VESSEL_CATEGORY_SWATCH = Object.freeze({
  tankers: VESSEL_KIND_STYLES.tanker.css,
  cargo: VESSEL_KIND_STYLES.cargo.css,
  passenger: VESSEL_KIND_STYLES.passenger.css,
  fishing: VESSEL_KIND_STYLES.fishing.css,
  service: VESSEL_KIND_STYLES.tug.css,
  leisure: VESSEL_KIND_STYLES.pleasure.css,
  other: VESSEL_KIND_STYLES.other.css,
});
