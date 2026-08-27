import { useState } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'

function MapClickHandler({ onClick }: { onClick: (latlng: any) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng)
    },
  })
  return null
}

function App() {
  const [waypoints, setWaypoints] = useState<any[]>([])

  const handleMapClick = (latlng: any) => {
    setWaypoints([...waypoints, latlng])
  }

  return (
    <div className="app-layout">
      {/* Map Background */}
      <MapContainer 
        center={[-6.2088, 106.8456]} 
        zoom={13} 
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onClick={handleMapClick} />
      </MapContainer>

      {/* Floating Control Panel */}
      <div className="control-panel glass-panel">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Kalla</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Realistic Sports Activity Generator</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          <button className="btn-primary">Generate GPX/TCX</button>
          <button className="btn-secondary" onClick={() => setWaypoints([])}>Clear Route</button>
        </div>
        
        <div style={{ marginTop: '16px', fontSize: '14px' }}>
          <p>Waypoints count: <strong>{waypoints.length}</strong></p>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Click on the map to add points and build your route.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
