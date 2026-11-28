import { t } from '../../i18n/index.js';
import { VESSEL_CATEGORIES } from '../../data/vesselTypes.js';
import { VESSEL_CATEGORY_SWATCH } from '../../data/vesselCategoryLabels.js';
import { normalizeVesselCategories } from './policy.js';

/**
 * A category's chip words: plural category names, told apart from the card's
 * ship type words by their context (see vesselCategoryLabels.js).
 * @param {string} category
 * @returns {string}
 */
function categoryLabel(category) {
  switch (category) {
    case 'tankers':
      return t('Tankers', { context: 'vessel category' });
    case 'cargo':
      return t('Cargo', { context: 'vessel category' });
    case 'passenger':
      return t('Passenger', { context: 'vessel category' });
    case 'fishing':
      return t('Fishing', { context: 'vessel category' });
    case 'service':
      return t('Service', { context: 'vessel category' });
    case 'leisure':
      return t('Leisure', { context: 'vessel category' });
    default:
      return t('Other', { context: 'vessel category' });
  }
}

/**
 * The category toggles of the vessels row: one chip per category, and the
 * params a share link keeps.
 * @param {object} context
 * @returns {{methods: object}}
 */
export function createControls({ vesselState, parts: components }) {
  const { state } = vesselState;

  const methods = {
    /** The category toggles, for share links and restoration. */
    getParams() {
      return { ...vesselState.categories };
    },

    /** Show or hide categories; unknown keys and non-booleans change nothing. */
    setParams(params = {}) {
      const next = normalizeVesselCategories(params, vesselState.categories);
      if (
        VESSEL_CATEGORIES.every(
          (key) => next[key] === vesselState.categories[key],
        )
      )
        return true;
      vesselState.categories = next;
      // A hidden vessel lets its selection go, unless the bridge camera
      // rides it: the bridge holds it until it lets go, and then it lets go.
      const selected = state.selectedRecord;
      if (
        selected &&
        !components.rendering.categoryShown(selected) &&
        selected.id !== state.cockpitSubjectId
      )
        components.selection.clearVesselInspection();
      components.rendering.applyCategoryVisibility();
      vesselState._panel?.invalidate();
      return true;
    },

    /**
     * One chip per category; a shown one carries its ships' colour and its
     * count of records.
     */
    getRowControls() {
      const counts = vesselState.categoryCounts;
      const chips = VESSEL_CATEGORIES.map((category) => {
        const on = vesselState.categories[category] !== false;
        const label = categoryLabel(category);
        const chip = {
          id: `vessels-${category}`,
          label: label.toUpperCase(),
          title: on
            ? t('Hide {category}', { category: label })
            : t('Show {category}', { category: label }),
          active: on,
          busy: false,
          disabled: false,
          state: on ? 'active' : 'idle',
          params: { [category]: !on },
        };
        if (!on) return chip;
        chip.swatch = VESSEL_CATEGORY_SWATCH[category];
        if (counts.get(category) > 0) chip.count = counts.get(category);
        return chip;
      });
      return { chips };
    },
  };

  return { methods };
}
