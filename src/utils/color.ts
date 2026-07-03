import { ValidationError } from './errors.js';

/**
 * Parse a color given as "#RRGGBB" / "RRGGBB" hex or an integer into
 * Discord's color int. Returns undefined when no color was provided;
 * throws ValidationError on malformed input (the previous per-module
 * copies of this logic produced NaN, which Discord rejects opaquely).
 */
export function parseColor(color: string | number | undefined): number | undefined {
  if (color === undefined) return undefined;
  if (typeof color === 'number') {
    if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
      throw new ValidationError(`Invalid color ${color}: must be an integer between 0 and 16777215`);
    }
    return color;
  }
  const hex = color.startsWith('#') ? color.slice(1) : color;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new ValidationError(`Invalid color "${color}": use "#RRGGBB" hex or an integer 0-16777215`);
  }
  return parseInt(hex, 16);
}
