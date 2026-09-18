export function classifyMotion(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue < 0.5) return 'resting'
  if (numericValue <= 2) return 'active'
  return 'high motion'
}
