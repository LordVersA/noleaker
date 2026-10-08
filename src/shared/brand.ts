/**
 * The noleaker mark: a shield outline with a droplet, drawn in a 100x100 box.
 * The shield is a stroke (width `SHIELD_STROKE`, round joins) along `SHIELD_PATH`; the droplet is
 * a fill. scripts/make-icons.mjs draws the same shapes for the packaged PNG icons, and the options
 * page uses them inline, so keep the three in step.
 */
export const SHIELD_PATH = 'M50 5 L85 17 V50 C85 71 69 85 50 95 C31 85 15 71 15 50 V17 Z';
export const SHIELD_STROKE = 10;
export const DROP_PATH =
  'M50 38 C50 38 42.5 47 42.5 55 A7.5 7.5 0 0 0 57.5 55 C57.5 47 50 38 50 38 Z';
export const BRAND_BLUE = '#4d8dff';
