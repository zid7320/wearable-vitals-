import { useEffect, useState } from 'react'

const EMPTY_READING = {
  heart_rate: null,
  temperature: null,
  motion: null,
  timestamp: null,
}

const isAbnormalHeartRate = (value) => value == null || value < 50 || value > 120
const isAbnormalTemperature = (value) => value == null || value > 38

function LiveVitals({ onReading }) {
  const [latest, setLatest] = useState(EMPTY_READING)
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  useEffect(() => {
    let socket
    let reconnectTimer
    let cancelled = false

    const connect = () => {
      if (cancelled) return

      setConnectionStatus('connecting')
      socket = new WebSocket('ws://localhost:3000')

      socket.onopen = () => {
        if (!cancelled) setConnectionStatus('live')
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload && payload.data) {
            setLatest(payload.data)
            if (typeof onReading === 'function') {
              onReading(payload.data)
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        setConnectionStatus('disconnected')
        reconnectTimer = setTimeout(() => {
          if (!cancelled) connect()
        }, 2000)
      }

      socket.onerror = () => {
        if (!cancelled) setConnectionStatus('disconnected')
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket) socket.close()
    }
  }, [onReading])

  const motionValue = Number(latest.motion ?? 0)
  const motionLabel = motionValue > 0.5 ? 'Active' : 'Resting'
  const heartIsAbnormal = isAbnormalHeartRate(latest.heart_rate)
  const temperatureIsAbnormal = isAbnormalTemperature(latest.temperature)

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Waiting for data...'
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const statusText =
    connectionStatus === 'connecting'
      ? 'Connecting'
      : connectionStatus === 'live'
        ? 'Live'
        : 'Disconnected'

  return (
    <section className="live-vitals">
      <div className="live-vitals__header">
        <div>
          <p className="eyebrow">Wearable Monitor</p>
          <h2>Live Vital Signs</h2>
        </div>
        <div className="header-tools">
          <span className={`connection-badge connection-badge--${connectionStatus}`}>
            {statusText}
          </span>
          <span className="timestamp">{formatTime(latest.timestamp)}</span>
        </div>
      </div>

      <div className="stats-grid">
        <article className={`stat-card stat-card--heart ${heartIsAbnormal ? 'stat-card--alert' : ''}`}>
          <label>Heart Rate</label>
          <div className="value-row">
            <span className={`value ${heartIsAbnormal ? 'value--alert' : ''}`}>
              {latest.heart_rate ?? '--'}
            </span>
            <span className="unit">BPM</span>
          </div>
          {heartIsAbnormal && <div className="alert-text">Abnormal</div>}
        </article>

        <article className={`stat-card stat-card--temp ${temperatureIsAbnormal ? 'stat-card--alert' : ''}`}>
          <label>Temperature</label>
          <div className="value-row">
            <span className={`value ${temperatureIsAbnormal ? 'value--alert' : ''}`}>
              {latest.temperature != null ? latest.temperature.toFixed(1) : '--'}
            </span>
            <span className="unit">°C</span>
          </div>
          {temperatureIsAbnormal && <div className="alert-text">High temp</div>}
        </article>

        <article className="stat-card stat-card--motion">
          <label>Motion</label>
          <div className="value-row">
            <span className="value">{motionValue > 0 ? motionValue.toFixed(1) : '0.0'}</span>
            <span className="unit">{motionLabel}</span>
          </div>
        </article>
      </div>
    </section>
  )
}

export default LiveVitals
