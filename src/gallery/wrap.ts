/** `value` mapped into [min, max): the position an endlessly repeating item shows at. */
export function wrapInto(value: number, min: number, max: number): number {
  const span = max - min;
  return ((((value - min) % span) + span) % span) + min;
}
