export const ANOMALY_WINDOW_SIZE = 20
export const ANOMALY_STDDEV_THRESHOLD = 2.5

export function updateAnomalyWindow(readings, value) {
  const numericValue = Number(value)
  const history = readings.filter((reading) => Number.isFinite(reading))
  let anomalous = false

  if (history.length >= ANOMALY_WINDOW_SIZE && Number.isFinite(numericValue)) {
    const mean = history.reduce((total, reading) => total + reading, 0) / history.length
    const variance = history.reduce((total, reading) => total + (reading - mean) ** 2, 0) / history.length
    const standardDeviation = Math.sqrt(variance)

    anomalous = standardDeviation === 0
      ? Math.abs(numericValue - mean) > ANOMALY_STDDEV_THRESHOLD
      : Math.abs(numericValue - mean) > ANOMALY_STDDEV_THRESHOLD * standardDeviation
  }

  return {
    readings: [...history, numericValue].slice(-ANOMALY_WINDOW_SIZE),
    anomalous,
  }
}
