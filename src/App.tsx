import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polyline, Marker, LayersControl } from 'react-leaflet'
import { fetchOSRMRoute } from './lib/osrm'
import { generateActivity, TrackPoint } from './lib/realism-engine'
import { generateTCX, downloadFile } from './lib/tcx-generator'
import { parseActivityFile, reverseTrack, adjustSpeed } from './lib/xml-parser'
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
  useMapEvents({ click(e) { onClick(e.latlng) } })
  return null
}

function GeocoderControl() {
  const map = useMapEvents({});
  useEffect(() => {
    // @ts-ignore
    const geocoder = L.Control.geocoder({ defaultMarkGeocode: false, position: 'topright' })
    .on('markgeocode', function(e: any) { map.fitBounds(e.geocode.bbox); })
    .addTo(map);
    return () => { map.removeControl(geocoder); };
  }, [map]);
  return null;
}

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

  // Edit Mode States
  const [editMode, setEditMode] = useState(false)
  const [uploadedTrack, setUploadedTrack] = useState<TrackPoint[]>([])
  const [trimmedTrack, setTrimmedTrack] = useState<TrackPoint[]>([])
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(100)
  const [editPace, setEditPace] = useState(6.5)

  const waypoints = history[historyIndex];

  useEffect(() => {
    if (editMode) return;
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
  }, [waypoints, sport, editMode]);

  const pushHistory = (newWaypoints: Waypoint[]) => {
    if (editMode) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newWaypoints);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleMapClick = (latlng: any) => {
    if (editMode) return;
    const newWaypoint: Waypoint = { lat: latlng.lat, lng: latlng.lng, snapped: isSnapping };
    pushHistory([...waypoints, newWaypoint]);
  }

  const handleMarkerClick = (index: number) => {
    if (editMode) return;
    if (index === 0 && waypoints.length > 2) {
      const firstWP = waypoints[0];
      const newWaypoint: Waypoint = { lat: firstWP.lat, lng: firstWP.lng, snapped: isSnapping };
      pushHistory([...waypoints, newWaypoint]);
    }
  }

  const handleClear = () => {
    setHistory([[]]);
    setHistoryIndex(0);
    setOsrmRoute([]);
    setEditMode(false);
    setUploadedTrack([]);
    setTrimmedTrack([]);
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      if (editMode) {
        const tcxData = generateTCX(trimmedTrack, sport)
        downloadFile(tcxData, `Kalla_Edited_${sport}.tcx`)
      } else {
        if (osrmRoute.length < 2) {
          alert("Draw a route first!")
          return;
        }
        const startDateTime = new Date(startTimeStr);
        const track = generateActivity(osrmRoute, startDateTime, pace, sport, useRandomStops)
        const tcxData = generateTCX(track, sport)
        downloadFile(tcxData, `Kalla_${sport}.tcx`)
      }
    } catch (err) {
      console.error(err)
      alert("Error generating activity.")
    } finally {
      setIsGenerating(false)
    }
  }

  // Edit Mode Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'tcx' && ext !== 'gpx') {
      alert("Only .tcx and .gpx supported");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const xml = event.target?.result as string;
      const parsedTrack = parseActivityFile(xml, ext);
      if (parsedTrack.length > 0) {
        setUploadedTrack(parsedTrack);
        setTrimmedTrack(parsedTrack);
        setEditMode(true);
        setTrimStart(0);
        setTrimEnd(100);
        
        const distKm = parsedTrack[parsedTrack.length-1].distance / 1000;
        const timeSecs = (new Date(parsedTrack[parsedTrack.length-1].time).getTime() - new Date(parsedTrack[0].time).getTime()) / 1000;
        if (distKm > 0) {
           setEditPace(parseFloat((timeSecs / 60 / distKm).toFixed(2)));
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  }

  const applyTrim = (startPct: number, endPct: number) => {
    setTrimStart(startPct);
    setTrimEnd(endPct);
    const startIdx = Math.floor((startPct / 100) * uploadedTrack.length);
    const endIdx = Math.ceil((endPct / 100) * uploadedTrack.length);
    setTrimmedTrack(uploadedTrack.slice(startIdx, endIdx));
  }

  const handleReverse = () => {
    const reversed = reverseTrack(trimmedTrack);
    setUploadedTrack(reversed);
    setTrimmedTrack(reversed);
    setTrimStart(0);
    setTrimEnd(100);
  }

  const handleApplyPace = () => {
    const adjusted = adjustSpeed(trimmedTrack, editPace);
    setTrimmedTrack(adjusted);
  }

  const displayRoute = editMode ? trimmedTrack.map(t => ({lat: t.lat, lng: t.lng})) : osrmRoute;

  return (
    <div className="app-layout">
      {/* Map Background */}
      <MapContainer center={[-6.2088, 106.8456]} zoom={13} zoomControl={false}>
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
        </LayersControl>
        <GeocoderControl />
        <MapClickHandler onClick={handleMapClick} />
        
        {!editMode && waypoints.map((wp, i) => (
          <Marker key={i} position={wp} eventHandlers={{ click: () => handleMarkerClick(i) }} />
        ))}
        {displayRoute.length > 0 && (
          <Polyline positions={displayRoute} color={editMode ? "#2563eb" : "#09090b"} weight={4} opacity={0.8} />
        )}
      </MapContainer>

      {/* Floating Control Panel */}
      <div className="control-panel glass-panel">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Kalla</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Realistic Sports Activity Generator</p>
        </div>

        <div style={{ marginTop: '8px' }}>
          <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
            Upload GPX/TCX
            <input type="file" accept=".gpx,.tcx" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>

        {editMode ? (
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Edit Mode</h3>
            
            <div style={{ marginBottom: '12px' }}>
               <label style={{ fontSize: '12px' }}>Trim Start ({trimStart}%)</label>
               <input type="range" min="0" max="100" value={trimStart} onChange={(e) => applyTrim(Number(e.target.value), trimEnd)} style={{width: '100%'}} />
               <label style={{ fontSize: '12px' }}>Trim End ({trimEnd}%)</label>
               <input type="range" min="0" max="100" value={trimEnd} onChange={(e) => applyTrim(trimStart, Number(e.target.value))} style={{width: '100%'}} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '12px' }}>
              <button className="btn-secondary" onClick={handleReverse}>Reverse Route</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input type="number" step="0.1" value={editPace} onChange={(e) => setEditPace(parseFloat(e.target.value))} style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)'}} />
              <button className="btn-secondary" onClick={handleApplyPace}>Apply Pace</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Export Edited TCX'}
              </button>
              <button className="btn-secondary" onClick={handleClear}>Exit Edit Mode</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { if(historyIndex>0) setHistoryIndex(historyIndex-1) }} disabled={historyIndex === 0} style={{ flex: 1, padding: '8px' }}>Undo</button>
              <button className="btn-secondary" onClick={() => { if(historyIndex<history.length-1) setHistoryIndex(historyIndex+1) }} disabled={historyIndex === history.length - 1} style={{ flex: 1, padding: '8px' }}>Redo</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                 <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Sport Type</label>
                 <select value={sport} onChange={(e) => setSport(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }}>
                   <option value="Running">Running</option>
                   <option value="Walking">Walking</option>
                   <option value="Biking">Biking</option>
                 </select>
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Target Pace</label>
                <input type="number" step="0.1" value={pace} onChange={(e) => setPace(parseFloat(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none' }} />
              </div>
            </div>

            <div>
               <label style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>Start Time</label>
               <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="snapToggle" checked={isSnapping} onChange={(e) => setIsSnapping(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <label htmlFor="snapToggle" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Snap to Roads</label>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="stopsToggle" checked={useRandomStops} onChange={(e) => setUseRandomStops(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <label htmlFor="stopsToggle" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Simulate Random Stops</label>
            </div>
            
            <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating || osrmRoute.length < 2} style={{ marginTop: '8px' }}>
              {isGenerating ? 'Generating...' : 'Generate TCX'}
            </button>
            <button className="btn-secondary" onClick={handleClear}>Clear Route</button>
            
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <p>Waypoints: {waypoints.length} | Nodes: {osrmRoute.length}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
