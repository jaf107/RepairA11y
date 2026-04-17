/**
 * Color utility functions following official WCAG 2.2 specifications
 * Based on: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */

/**
 * Parse CSS color string to RGBA object
 * Supports: rgb(), rgba(), hex (#fff, #ffffff), and common named colors
 *
 * @param {string} colorString - CSS color string
 * @returns {Object|null} - {r, g, b, a} or null if unparseable
 */
export function parseColor(colorString) {
  if (!colorString || colorString === 'none' || colorString === 'transparent') {
    return null;
  }

  // Handle rgb() and rgba()
  const rgbaMatch = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    };
  }

  // Handle hex colors (#fff or #ffffff)
  const hexMatch = colorString.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    // Expand shorthand (#fff -> #ffffff)
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
      a: 1
    };
  }

  // Handle common named colors
  const namedColors = {
    'white': { r: 255, g: 255, b: 255, a: 1 },
    'black': { r: 0, g: 0, b: 0, a: 1 },
    'red': { r: 255, g: 0, b: 0, a: 1 },
    'green': { r: 0, g: 128, b: 0, a: 1 },
    'blue': { r: 0, g: 0, b: 255, a: 1 },
    'yellow': { r: 255, g: 255, b: 0, a: 1 },
    'gray': { r: 128, g: 128, b: 128, a: 1 },
    'grey': { r: 128, g: 128, b: 128, a: 1 },
    'silver': { r: 192, g: 192, b: 192, a: 1 }
  };

  const normalized = colorString.toLowerCase().trim();
  if (namedColors[normalized]) {
    return namedColors[normalized];
  }

  return null;
}

/**
 * Calculate relative luminance per WCAG 2.2 specification
 * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are gamma-corrected values
 *
 * Reference: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 *
 * @param {Object} color - {r, g, b, a} color object (0-255 range)
 * @returns {number} - Relative luminance (0-1 range)
 */
export function getLuminance(color) {
  if (!color) return 0;

  // Convert RGB values from 0-255 to 0-1 range
  const rsRGB = color.r / 255;
  const gsRGB = color.g / 255;
  const bsRGB = color.b / 255;

  // Apply gamma correction
  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  // Calculate relative luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.2 specification
 * Formula: (L1 + 0.05) / (L2 + 0.05)
 * where L1 is the lighter luminance and L2 is the darker luminance
 *
 * Reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 *
 * @param {Object} color1 - First color {r, g, b, a}
 * @param {Object} color2 - Second color {r, g, b, a}
 * @returns {number} - Contrast ratio (1:1 to 21:1)
 */
export function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);

  // L1 must be the lighter luminance
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  // Official WCAG formula
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG 2.4.13 requirement
 * AAA level requires at least 3:1 contrast ratio for focus indicators
 *
 * @param {number} ratio - Contrast ratio
 * @param {number} threshold - Minimum required ratio (default 3 for AAA)
 * @returns {boolean} - True if meets requirement
 */
export function meetsContrastRequirement(ratio, threshold = 3) {
  return ratio >= threshold;
}

/**
 * Calculate the change-of-contrast between before and after states
 * This is specifically for 2.4.13 which measures contrast change on focus
 *
 * @param {Object} beforeColor - Color before focus
 * @param {Object} afterColor - Color after focus
 * @param {Object} referenceColor - Reference color (usually background or foreground)
 * @returns {number} - Difference in contrast ratios
 */
export function getContrastChange(beforeColor, afterColor, referenceColor) {
  const beforeRatio = getContrastRatio(beforeColor, referenceColor);
  const afterRatio = getContrastRatio(afterColor, referenceColor);

  return Math.abs(afterRatio - beforeRatio);
}
