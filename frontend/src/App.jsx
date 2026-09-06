import { useState } from 'react'
import './App.css'
import HistoryChart from './components/HistoryChart'
import LiveVitals from './components/LiveVitals'

const MAX_HISTORY_POINTS = 500

function App() {
  const [chartData, setChartData] = useState([])

  const handleLiveReading = (reading) => {
    if (!reading || reading.timestamp == null) return

    setChartData((current) => {
      const next = [...current, reading]
      return next.slice(-MAX_HISTORY_POINTS)
    })
  }

  return (
    <main className="app-shell app-shell--stacked">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">W</div>
          <div>
            <p className="brand__eyebrow">Wearable telemetry</p>
            <h1>Vitals Dashboard</h1>
          </div>
        </div>
      </header>

      <LiveVitals onReading={handleLiveReading} />
      <HistoryChart data={chartData} onDataChange={setChartData} />
    </main>
  )
}

export default App
