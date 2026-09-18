import { useCallback, useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { classifyMotion } from '../utils/motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const RANGE_OPTIONS = ['1h', '6h', '24h']
const MAX_HISTORY_POINTS = 500

function HistoryChart({ data = [], onDataChange, theme, deviceId }) {
  const [range, setRange] = useState('24h')
  const [loading, setLoading] = useState(true)
  const [compareYesterday, setCompareYesterday] = useState(false)
  const [yesterdayData, setYesterdayData] = useState([])

  const fetchHistory = useCallback(async (offsetHours = 0) => {
    const params = new URLSearchParams({ range })
    if (deviceId) params.set('device_id', deviceId)
    if (offsetHours) params.set('offset_hours', String(offsetHours))

    const response = await fetch(`http://localhost:3000/vitals/history?${params.toString()}`, { credentials: 'include' })
    if (!response.ok) return []

    const result = await response.json()
    return Array.isArray(result?.data) ? result.data.slice(-MAX_HISTORY_POINTS) : []
  }, [deviceId, range])

  useEffect(() => {
    let ignore = false

    // The fetch lifecycle owns this loading state.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true)
    fetchHistory().then((rows) => {
      if (!ignore && typeof onDataChange === 'function') onDataChange(rows)
    }).catch((error) => {
      console.error('History fetch failed:', error)
      if (!ignore && typeof onDataChange === 'function') onDataChange([])
    }).finally(() => {
      if (!ignore) setLoading(false)
    })

    return () => {
      ignore = true
    }
  }, [fetchHistory, onDataChange])

  useEffect(() => {
    if (!compareYesterday) {
      // Clear reference data immediately when comparison is disabled.
      // oxlint-disable-next-line react/set-state-in-effect
      setYesterdayData([])
      return undefined
    }

    let ignore = false
    fetchHistory(24).then((rows) => {
      if (!ignore) setYesterdayData(rows)
    }).catch(() => {
      if (!ignore) setYesterdayData([])
    })

    return () => {
      ignore = true
    }
  }, [compareYesterday, fetchHistory])

  const chartData = useMemo(() => {
    const themeRoot = document.querySelector(`html[data-theme="${theme}"]`) || document.documentElement
    const styles = getComputedStyle(themeRoot)
    const heartColor = styles.getPropertyValue('--chart-heart').trim()
    const temperatureColor = styles.getPropertyValue('--chart-temperature').trim()

    const liveStart = data[0]?.timestamp || 0
    const yesterdayStart = yesterdayData[0]?.timestamp || 0
    const relativeLabel = (timestamp, start) => {
      const minutes = Math.max(0, Math.round((timestamp - start) / 60000))
      return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
    }
    const labels = data.map((row) => relativeLabel(row.timestamp, liveStart))
    const referenceValues = data.map((row) => {
      if (yesterdayData.length === 0) return null
      const targetOffset = row.timestamp - liveStart
      const nearest = yesterdayData.reduce((best, candidate) => (
        Math.abs((candidate.timestamp - yesterdayStart) - targetOffset)
          < Math.abs((best.timestamp - yesterdayStart) - targetOffset) ? candidate : best
      ), yesterdayData[0])
      return nearest
    })

    return {
      labels,
      datasets: [
        {
          label: 'Heart Rate (BPM)',
          data: data.map((row) => row.heart_rate),
          borderColor: heartColor,
          backgroundColor: styles.getPropertyValue('--chart-heart-bg').trim(),
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        ...(yesterdayData.length > 0 ? [{
          label: 'Yesterday heart rate (BPM)',
          data: referenceValues.map((row) => row?.heart_rate ?? null),
          borderColor: styles.getPropertyValue('--chart-heart-ghost').trim(),
          borderDash: [6, 5],
          borderWidth: 2,
          borderCapStyle: 'round',
          backgroundColor: 'transparent',
          tension: 0.25,
          pointRadius: 0,
          spanGaps: true,
        }] : []),
        {
          label: 'Temperature (°C)',
          data: data.map((row) => row.temperature),
          borderColor: temperatureColor,
          backgroundColor: styles.getPropertyValue('--chart-temperature-bg').trim(),
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        ...(yesterdayData.length > 0 ? [{
          label: 'Yesterday temperature (°C)',
          data: referenceValues.map((row) => row?.temperature ?? null),
          borderColor: styles.getPropertyValue('--chart-temperature-ghost').trim(),
          borderDash: [6, 5],
          borderWidth: 2,
          borderCapStyle: 'round',
          backgroundColor: 'transparent',
          tension: 0.25,
          pointRadius: 0,
          spanGaps: true,
        }] : []),
      ],
    }
  }, [data, theme, yesterdayData])

  const motionBands = useMemo(() => {
    if (data.length === 0) return []

    return data.reduce((bands, row, index) => {
      const activity = classifyMotion(row.motion)
      const previousBand = bands[bands.length - 1]

      if (previousBand?.activity === activity) {
        previousBand.count += 1
      } else {
        bands.push({ activity, count: 1, startIndex: index })
      }

      return bands
    }, []).map((band) => ({
      ...band,
      width: `${(band.count / data.length) * 100}%`,
    }))
  }, [data])

  const downloadCsv = () => {
    if (data.length === 0) return

    const hasDeviceColumn = data.some((row) => Object.prototype.hasOwnProperty.call(row, 'device_id'))
    const columns = hasDeviceColumn
      ? ['timestamp', 'device_id', 'heart_rate', 'temperature', 'motion']
      : ['timestamp', 'heart_rate', 'temperature', 'motion']
    const escapeCsvValue = (value) => {
      const text = value == null ? '' : String(value)
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    }
    const csv = [
      columns.join(','),
      ...data.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')),
    ].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    const deviceSegment = deviceId ? `_${deviceId}` : ''

    link.href = url
    link.download = `vitals${deviceSegment}_${range}_${date}.csv`
    link.click()
    URL.revokeObjectURL(url)
    link.remove()
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--chart-axis').trim(),
          maxTicksLimit: 7,
        },
        grid: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim(),
        },
      },
      y: {
        ticks: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--chart-axis').trim(),
        },
        grid: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim(),
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: getComputedStyle(document.documentElement).getPropertyValue('--chart-legend').trim(),
        },
      },
      title: {
        display: false,
      },
    },
  }

  return (
    <section className="history-chart">
      <div className="history-chart__header">
        <div>
          <p className="eyebrow">Trend data</p>
          <h3>Vitals History</h3>
        </div>

        <div className="range-switcher" aria-label="Select time range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === range ? 'range-button range-button--active' : 'range-button'}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            className="download-button"
            onClick={downloadCsv}
            disabled={data.length === 0}
          >
            Download CSV
          </button>
          <label className="compare-toggle">
            <input
              type="checkbox"
              checked={compareYesterday}
              onChange={(event) => setCompareYesterday(event.target.checked)}
            />
            Compare to yesterday
          </label>
        </div>
      </div>

      {loading ? (
        <div className="chart-empty">Loading chart…</div>
      ) : data.length === 0 ? (
        <div className="chart-empty">No data available for this range.</div>
      ) : (
        <>
          <div className="chart-panel">
            <Line data={chartData} options={options} />
          </div>
          <div className="motion-strip" aria-label="Motion activity bands">
            {motionBands.map((band) => (
              <span
                key={`${band.activity}-${band.startIndex}`}
                className={`motion-band motion-band--${band.activity.replace(' ', '-')}`}
                style={{ width: band.width }}
                title={band.activity}
              />
            ))}
          </div>
          <div className="motion-legend" aria-label="Motion activity legend">
            <span><i className="motion-swatch motion-swatch--resting" />Resting</span>
            <span><i className="motion-swatch motion-swatch--active" />Active</span>
            <span><i className="motion-swatch motion-swatch--high-motion" />High motion</span>
          </div>
        </>
      )}
    </section>
  )
}

export default HistoryChart
