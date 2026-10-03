export function graphTableInterval(
  lower: string,
  upper: string,
): [number, number] | null {
  if (!lower.trim() || !upper.trim()) return null;
  const bounds: [number, number] = [Number(lower), Number(upper)];
  return bounds.every(Number.isFinite) ? bounds : null;
}
