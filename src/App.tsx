import { useState } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polyline, Marker } from 'react-leaflet'
import { fetchOSRMRoute } from './lib/osrm'
import { generateActivity } from './lib/realism-engine'
import { generateTCX, downloadFile } from './lib/tcx-generator'
import L from 'leaflet'

// Fix Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

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
  const [osrmRoute, setOsrmRoute] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [pace, setPace] = useState(6.5) // Default 6:30 min/km

  const handleMapClick = async (latlng: any) => {
    const newWaypoints = [...waypoints, latlng]
    setWaypoints(newWaypoints)
    
    // Auto-fetch route if more than 1 waypoint
    if (newWaypoints.length > 1) {
      const route = await fetchOSRMRoute(newWaypoints, 'walking')
      if (route) {
        setOsrmRoute(route)
      }
    }
  }

  const handleGenerate = async () => {
    if (osrmRoute.length < 2) {
      alert("Please draw a route first by clicking at least 2 points on the map.")
      return
    }
    
    setIsGenerating(true)
    try {
      // 1. Run Realism Engine
      const track = generateActivity(osrmRoute, new Date(), pace)
      
      // 2. Generate TCX
      const tcxData = generateTCX(track, 'Running')
      
      // 3. Download
      downloadFile(tcxData, 'Kalla_Activity.tcx')
    } catch (err) {
      console.error(err)
      alert("Error generating activity.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleClear = () => {
    setWaypoints([])
    setOsrmRoute([])
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
        
        {/* Draw Waypoints */}
        {waypoints.map((wp, i) => (
          <Marker key={i} position={wp} />
        ))}

        {/* Draw Snapped Route */}
        {osrmRoute.length > 0 && (
          <Polyline positions={osrmRoute} color="#09090b" weight={4} opacity={0.7} />
        )}
      </MapContainer>

      {/* Floating Control Panel */}
      <div className="control-panel glass-panel">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Kalla</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Realistic Sports Activity Generator</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>
              Target Pace (min/km)
            </label>
            <input 
              type="number" 
              step="0.1"
              value={pace}
              onChange={(e) => setPace(parseFloat(e.target.value))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
            />
          </div>
        
          <button 
            className="btn-primary" 
            onClick={handleGenerate}
            disabled={isGenerating || waypoints.length < 2}
            style={{ opacity: (isGenerating || waypoints.length < 2) ? 0.5 : 1 }}
          >
            {isGenerating ? 'Generating...' : 'Generate TCX'}
          </button>
          
          <button className="btn-secondary" onClick={handleClear}>Clear Route</button>
        </div>
        
        <div style={{ marginTop: '16px', fontSize: '14px' }}>
          <p>Waypoints: <strong>{waypoints.length}</strong></p>
          <p>Route nodes: <strong>{osrmRoute.length}</strong></p>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Click on the map to add points and build your route.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
