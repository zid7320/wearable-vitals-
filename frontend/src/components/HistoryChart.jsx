import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
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

function HistoryChart({ data = [], onDataChange }) {
  const [range, setRange] = useState('24h')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    const fetchHistory = async () => {
      setLoading(true)
      try {
        const response = await fetch(`http://localhost:3000/vitals/history?range=${range}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status}`)
        }

        const result = await response.json()
        const rows = Array.isArray(result?.data) ? result.data : []

        if (!ignore) {
          const trimmed = rows.slice(-MAX_HISTORY_POINTS)
          if (typeof onDataChange === 'function') {
            onDataChange(trimmed)
          }
        }
      } catch (error) {
        console.error('History fetch failed:', error)
        if (!ignore && typeof onDataChange === 'function') {
          onDataChange([])
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchHistory()

    return () => {
      ignore = true
    }
  }, [range, onDataChange])

  const chartData = useMemo(() => {
    const labels = data.map((row) => new Date(row.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }))

    return {
      labels,
      datasets: [
        {
          label: 'Heart Rate (BPM)',
          data: data.map((row) => row.heart_rate),
          borderColor: '#f87171',
          backgroundColor: 'rgba(248, 113, 113, 0.15)',
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: 'Temperature (°C)',
          data: data.map((row) => row.temperature),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.15)',
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    }
  }, [data])

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
          color: '#cbd5e1',
          maxTicksLimit: 7,
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.15)',
        },
      },
      y: {
        ticks: {
          color: '#cbd5e1',
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.15)',
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: '#e2e8f0',
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
        </div>
      </div>

      {loading ? (
        <div className="chart-empty">Loading chart…</div>
      ) : data.length === 0 ? (
        <div className="chart-empty">No data available for this range.</div>
      ) : (
        <div className="chart-panel">
          <Line data={chartData} options={options} />
        </div>
      )}
    </section>
  )
}

export default HistoryChart
