export const DEFAULT_THRESHOLDS = {
  heartRateWarningLow: 60,
  heartRateWarningHigh: 100,
  heartRateCriticalLow: 50,
  heartRateCriticalHigh: 120,
  temperatureWarning: 37.5,
  temperatureCritical: 38.5,
}

export function isValidThresholds(thresholds) {
  const values = Object.values(thresholds || {})
  if (values.length !== Object.keys(DEFAULT_THRESHOLDS).length) return false
  if (values.some((value) => value === '' || !Number.isFinite(Number(value)))) return false

  const numeric = Object.fromEntries(
    Object.entries(thresholds).map(([key, value]) => [key, Number(value)]),
  )

  return numeric.heartRateCriticalLow <= numeric.heartRateWarningLow
    && numeric.heartRateWarningLow <= numeric.heartRateWarningHigh
    && numeric.heartRateWarningHigh <= numeric.heartRateCriticalHigh
    && numeric.temperatureWarning <= numeric.temperatureCritical
}

export function getZone(vitalType, value, thresholds) {
  const numericValue = Number(value)
  const activeThresholds = thresholds || DEFAULT_THRESHOLDS

  if (value == null || Number.isNaN(numericValue)) {
    return 'normal'
  }

  if (vitalType === 'heart_rate' || vitalType === 'heartRate') {
    if (numericValue < activeThresholds.heartRateCriticalLow || numericValue > activeThresholds.heartRateCriticalHigh) {
      return 'critical'
    }

    if (numericValue < activeThresholds.heartRateWarningLow || numericValue > activeThresholds.heartRateWarningHigh) {
      return 'warning'
    }
  }

  if (vitalType === 'temperature') {
    if (numericValue > activeThresholds.temperatureCritical) {
      return 'critical'
    }

    if (numericValue > activeThresholds.temperatureWarning) {
      return 'warning'
    }
  }

  return 'normal'
}
