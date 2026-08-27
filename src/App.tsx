import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polyline, Marker, LayersControl } from 'react-leaflet'
import { fetchOSRMRoute } from './lib/osrm'
import { generateActivity } from './lib/realism-engine'
import { generateTCX, downloadFile } from './lib/tcx-generator'
import L from 'leaflet'
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type Waypoint = { lat: number, lng: number, snapped: boolean };

function MapClickHandler({ onClick }: { onClick: (latlng: any) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng)
    },
  })
  return null
}

function GeocoderControl() {
  const map = useMapEvents({});
  useEffect(() => {
    // @ts-ignore
    const geocoder = L.Control.geocoder({
      defaultMarkGeocode: false,
      position: 'topright'
    })
    .on('markgeocode', function(e: any) {
      const bbox = e.geocode.bbox;
      map.fitBounds(bbox);
    })
    .addTo(map);

    return () => {
      map.removeControl(geocoder);
    };
  }, [map]);
  return null;
}

// Get current datetime string for default input
const getDefaultDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

function App() {
  const [history, setHistory] = useState<Waypoint[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [osrmRoute, setOsrmRoute] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Customization States
  const [pace, setPace] = useState(6.5)
  const [isSnapping, setIsSnapping] = useState(true)
  const [sport, setSport] = useState<'Running' | 'Walking' | 'Biking'>('Running')
  const [startTimeStr, setStartTimeStr] = useState(getDefaultDateTime())
  const [useRandomStops, setUseRandomStops] = useState(false)

  const waypoints = history[historyIndex];

  useEffect(() => {
    const calculateRoute = async () => {
      if (waypoints.length < 2) {
        setOsrmRoute([]);
        return;
      }
      
      let fullRoute: any[] = [];
      fullRoute.push({ lat: waypoints[0].lat, lng: waypoints[0].lng });

      for (let i = 1; i < waypoints.length; i++) {
        const p1 = waypoints[i-1];
        const p2 = waypoints[i];
        
        if (p2.snapped) {
          const profile = sport === 'Biking' ? 'cycling' : 'walking';
          const segment = await fetchOSRMRoute([p1, p2], profile);
          if (segment && segment.length > 0) {
            segment.shift(); 
            fullRoute = [...fullRoute, ...segment];
          } else {
            fullRoute.push({ lat: p2.lat, lng: p2.lng });
          }
        } else {
          fullRoute.push({ lat: p2.lat, lng: p2.lng });
        }
      }
      setOsrmRoute(fullRoute);
    };

    calculateRoute();
  }, [waypoints, sport]); // Recalculate if sport changes (OSRM profile might change)

  const pushHistory = (newWaypoints: Waypoint[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newWaypoints);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleMapClick = (latlng: any) => {
    const newWaypoint: Waypoint = { lat: latlng.lat, lng: latlng.lng, snapped: isSnapping };
    pushHistory([...waypoints, newWaypoint]);
  }

  // Feature: Loop Route
  const handleMarkerClick = (index: number) => {
    if (index === 0 && waypoints.length > 2) {
      // User clicked the first marker, and we have enough points to form a loop
      const firstWP = waypoints[0];
      const newWaypoint: Waypoint = { lat: firstWP.lat, lng: firstWP.lng, snapped: isSnapping };
      pushHistory([...waypoints, newWaypoint]);
    }
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    }
  }

  const handleClear = () => {
    setHistory([[]]);
    setHistoryIndex(0);
    setOsrmRoute([]);
  }

  const handleGenerate = async () => {
    if (osrmRoute.length < 2) {
      alert("Please draw a route first by clicking at least 2 points on the map.")
      return
    }
    
    setIsGenerating(true)
    try {
      const startDateTime = new Date(startTimeStr);
      const track = generateActivity(osrmRoute, startDateTime, pace, sport, useRandomStops)
      const tcxData = generateTCX(track, sport)
      downloadFile(tcxData, `Kalla_${sport}.tcx`)
    } catch (err) {
      console.error(err)
      alert("Error generating activity.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="app-layout">
      {/* Map Background */}
      <MapContainer 
        center={[-6.2088, 106.8456]} 
        zoom={13} 
        zoomControl={false}
      >
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <GeocoderControl />
        <MapClickHandler onClick={handleMapClick} />
        
        {/* Draw Waypoints */}
        {waypoints.map((wp, i) => (
          <Marker 
            key={i} 
            position={wp} 
            eventHandlers={{ click: () => handleMarkerClick(i) }} 
            title={i === 0 ? "Click to close loop" : ""}
          />
        ))}

        {/* Draw Snapped Route */}
        {osrmRoute.length > 0 && (
          <Polyline positions={osrmRoute} color="#09090b" weight={4} opacity={0.8} />
        )}
      </MapContainer>

      {/* Floating Control Panel */}
      <div className="control-panel glass-panel">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Kalla</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Realistic Sports Activity Generator</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button className="btn-secondary" onClick={handleUndo} disabled={historyIndex === 0} style={{ flex: 1, padding: '8px' }}>Undo</button>
          <button className="btn-secondary" onClick={handleRedo} disabled={historyIndex === history.length - 1} style={{ flex: 1, padding: '8px' }}>Redo</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
          <div>
             <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Sport Type</label>
             <select 
               value={sport} 
               onChange={(e) => setSport(e.target.value as any)}
               style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
             >
               <option value="Running">Running</option>
               <option value="Walking">Walking</option>
               <option value="Biking">Biking</option>
             </select>
          </div>
          <div>
            <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Target Pace</label>
            <input 
              type="number" step="0.1" value={pace} onChange={(e) => setPace(parseFloat(e.target.value))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}
            />
          </div>
        </div>

        <div>
           <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Start Time</label>
           <input 
             type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)}
             style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'inherit' }}
           />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" id="snapToggle" checked={isSnapping} onChange={(e) => setIsSnapping(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="snapToggle" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Snap to Roads (OSRM)</label>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" id="stopsToggle" checked={useRandomStops} onChange={(e) => setUseRandomStops(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="stopsToggle" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Simulate Random Stops</label>
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating || osrmRoute.length < 2}>
            {isGenerating ? 'Generating...' : 'Generate TCX'}
          </button>
          <button className="btn-secondary" onClick={handleClear}>Clear Route</button>
        </div>
        
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <p>Waypoints: {waypoints.length} | Nodes: {osrmRoute.length}</p>
        </div>
      </div>
    </div>
  )
}

export default App
