import { useCallback, useEffect, useRef, useState } from 'react'
import { updateAnomalyWindow } from '../utils/anomaly'
import { getZone } from '../utils/zones'
import useToast from './useToast'

const EMPTY_READING = {
  heart_rate: null,
  temperature: null,
  motion: null,
  timestamp: null,
}

const ANIMATION_DURATION = 400

const EMPTY_DISPLAYED_READING = {
  heart_rate: null,
  temperature: null,
  motion: null,
}

const EMPTY_ANOMALIES = {
  heart_rate: false,
  temperature: false,
}

function LiveVitals({ onReading, thresholds, selectedDevice, onDeviceSeen }) {
  const [latest, setLatest] = useState(EMPTY_READING)
  const [displayed, setDisplayed] = useState(EMPTY_DISPLAYED_READING)
  const [anomalies, setAnomalies] = useState(EMPTY_ANOMALIES)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const { addToast } = useToast()
  const previousZones = useRef({
    heart_rate: 'normal',
    temperature: 'normal',
  })
  const selectedDeviceRef = useRef(selectedDevice)
  const animationFrames = useRef({
    heart_rate: null,
    temperature: null,
    motion: null,
  })
  const displayedValues = useRef(EMPTY_DISPLAYED_READING)
  const trendWindows = useRef(new Map())

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice
  }, [selectedDevice])

  useEffect(() => {
    displayedValues.current = EMPTY_DISPLAYED_READING
    previousZones.current = { heart_rate: 'normal', temperature: 'normal' }
  }, [selectedDevice])

  const animateValue = (field, target) => {
    if (!Number.isFinite(target)) return

    const previousFrame = animationFrames.current[field]
    if (previousFrame !== null) {
      cancelAnimationFrame(previousFrame)
    }

    const start = displayedValues.current[field]
    if (!Number.isFinite(start)) {
      displayedValues.current[field] = target
      setDisplayed((current) => ({ ...current, [field]: target }))
      return
    }

    const startedAt = performance.now()
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / ANIMATION_DURATION, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      const value = start + (target - start) * easedProgress

      displayedValues.current[field] = value
      setDisplayed((current) => ({ ...current, [field]: value }))

      if (progress < 1) {
        animationFrames.current[field] = requestAnimationFrame(frame)
      } else {
        animationFrames.current[field] = null
      }
    }

    animationFrames.current[field] = requestAnimationFrame(frame)
  }

  const checkZoneTransition = useCallback((vitalType, value) => {
    const nextZone = getZone(vitalType, value, thresholds)
    const previousZone = previousZones.current[vitalType]

    if (previousZone !== nextZone && nextZone !== 'normal') {
      const vitalLabel = vitalType === 'heart_rate' ? 'Heart rate' : 'Temperature'
      const formattedValue = vitalType === 'heart_rate'
        ? `${Math.round(Number(value))} BPM`
        : `${Number(value).toFixed(1)}°C`
      const zoneLabel = nextZone === 'warning' ? 'elevated' : 'critical'

      addToast({
        zone: nextZone,
        message: `${vitalLabel} ${zoneLabel}: ${formattedValue}`,
      })

      if (
        nextZone === 'critical'
        && typeof Notification !== 'undefined'
        && Notification.permission === 'granted'
        && document.hidden
      ) {
        new Notification(`${vitalLabel} critical`, { body: `${vitalLabel} critical: ${formattedValue}` })
      }
    }

    previousZones.current[vitalType] = nextZone
  }, [addToast, thresholds])

  const checkTrendAnomaly = useCallback((deviceId, vitalType, value) => {
    if (!deviceId) return

    const key = `${deviceId}:${vitalType}`
    const currentWindow = trendWindows.current.get(key) || []
    const result = updateAnomalyWindow(currentWindow, value)
    trendWindows.current.set(key, result.readings)

    if (!selectedDeviceRef.current || selectedDeviceRef.current === deviceId) {
      setAnomalies((current) => ({ ...current, [vitalType]: result.anomalous }))
    }
  }, [])

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
            const incomingDevice = payload.data.device_id
            if (typeof onDeviceSeen === 'function' && incomingDevice) {
              onDeviceSeen(incomingDevice)
            }

            checkTrendAnomaly(incomingDevice, 'heart_rate', payload.data.heart_rate)
            checkTrendAnomaly(incomingDevice, 'temperature', payload.data.temperature)

            if (selectedDeviceRef.current && incomingDevice !== selectedDeviceRef.current) return

            setLatest(payload.data)
            checkZoneTransition('heart_rate', payload.data.heart_rate)
            checkZoneTransition('temperature', payload.data.temperature)
            animateValue('heart_rate', Number(payload.data.heart_rate))
            animateValue('temperature', Number(payload.data.temperature))
            animateValue('motion', Number(payload.data.motion))
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
  }, [checkTrendAnomaly, checkZoneTransition, onDeviceSeen, onReading])

  useEffect(() => {
    const frames = animationFrames.current

    return () => {
      Object.values(frames).forEach((frame) => {
        if (frame !== null) cancelAnimationFrame(frame)
      })
    }
  }, [])

  const hasSelectedReading = !selectedDevice || latest.device_id === selectedDevice
  const visibleReading = hasSelectedReading ? latest : EMPTY_READING
  const visibleDisplayed = hasSelectedReading ? displayed : EMPTY_DISPLAYED_READING
  const visibleAnomalies = hasSelectedReading ? anomalies : EMPTY_ANOMALIES
  const motionValue = Number(visibleDisplayed.motion ?? 0)
  const motionLabel = motionValue > 0.5 ? 'Active' : 'Resting'
  const heartZone = getZone('heart_rate', visibleReading.heart_rate, thresholds)
  const temperatureZone = getZone('temperature', visibleReading.temperature, thresholds)
  const heartRate = Number(visibleReading.heart_rate)
  const heartPulseDuration = Number.isFinite(heartRate) && heartRate > 0 ? 60 / heartRate : 1
  const displayedTimestamp = visibleReading.timestamp

  const zoneBadgeText = {
    normal: 'NORMAL',
    warning: 'ELEVATED',
    critical: 'ABNORMAL',
  }

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
          <span className="timestamp">{formatTime(displayedTimestamp)}</span>
        </div>
      </div>

      <div className="stats-grid">
        <article className={`stat-card stat-card--heart stat-card--${heartZone === 'critical' ? 'alert' : heartZone}`}>
          <label className="heart-rate-label">
            <span>Heart Rate</span>
            <span
              className="heart-pulse"
              style={{ animationDuration: `${heartPulseDuration}s` }}
              aria-hidden="true"
            />
          </label>
          <div className="value-row">
            <span className={`value ${heartZone === 'critical' ? 'value--alert' : heartZone === 'warning' ? 'value--warning' : ''}`}>
              {visibleDisplayed.heart_rate == null ? '--' : Math.round(visibleDisplayed.heart_rate)}
            </span>
            <span className="unit">BPM</span>
          </div>
          <div className={`zone-badge zone-badge--${heartZone}`}>
            {zoneBadgeText[heartZone]}
          </div>
          {visibleAnomalies.heart_rate && <div className="trend-anomaly-badge">Unusual reading</div>}
        </article>

        <article className={`stat-card stat-card--temp stat-card--${temperatureZone === 'critical' ? 'alert' : temperatureZone}`}>
          <label>Temperature</label>
          <div className="value-row">
            <span className={`value ${temperatureZone === 'critical' ? 'value--alert' : temperatureZone === 'warning' ? 'value--warning' : ''}`}>
              {visibleDisplayed.temperature == null ? '--' : visibleDisplayed.temperature.toFixed(1)}
            </span>
            <span className="unit">°C</span>
          </div>
          <div className={`zone-badge zone-badge--${temperatureZone}`}>
            {zoneBadgeText[temperatureZone]}
          </div>
          {visibleAnomalies.temperature && <div className="trend-anomaly-badge">Unusual reading</div>}
        </article>

        <article className="stat-card stat-card--motion">
          <label>Motion</label>
          <div className="value-row">
            <span className="value">{visibleDisplayed.motion == null ? '--' : visibleDisplayed.motion.toFixed(1)}</span>
            <span className="unit">{motionLabel}</span>
          </div>
        </article>
      </div>
    </section>
  )
}

export default LiveVitals
