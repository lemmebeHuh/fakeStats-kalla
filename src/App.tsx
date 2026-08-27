import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polyline, Marker, LayersControl, useMap } from 'react-leaflet'
import { fetchOSRMRoute } from './lib/osrm'
import { generateActivity, TrackPoint, PacingStrategy } from './lib/realism-engine'
import { generateTCX, downloadFile, DEVICES } from './lib/tcx-generator'
import { parseActivityFile } from './lib/xml-parser'
import Dashboard from './components/Dashboard'
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

function MapBoundsController({ route }: { route: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length > 0) {
      const bounds = L.latLngBounds(route.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);
  return null;
}

const getDefaultDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export default function App() {
  const [history, setHistory] = useState<Waypoint[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [osrmRoute, setOsrmRoute] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedTrack, setGeneratedTrack] = useState<TrackPoint[] | null>(null)
  
  // Customization States
  const [pace, setPace] = useState(6.5)
  const [isSnapping, setIsSnapping] = useState(true)
  const [sport, setSport] = useState<'Running' | 'Walking' | 'Biking'>('Running')
  const [startTimeStr, setStartTimeStr] = useState(getDefaultDateTime())
  const [useRandomStops, setUseRandomStops] = useState(false)
  const [loops, setLoops] = useState(1)
  const [pacingStrategy, setPacingStrategy] = useState<PacingStrategy>('Flat')
  const [deviceKey, setDeviceKey] = useState<keyof typeof DEVICES>('garmin945')
  const [elevSensitivity, setElevSensitivity] = useState(1.0)

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
      setGeneratedTrack(null); // reset analytics when route changes
    };

    calculateRoute();
  }, [waypoints, sport]);

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

  const handleMarkerClick = (index: number) => {
    if (index === 0 && waypoints.length > 2) {
      const firstWP = waypoints[0];
      const newWaypoint: Waypoint = { lat: firstWP.lat, lng: firstWP.lng, snapped: isSnapping };
      pushHistory([...waypoints, newWaypoint]);
    } else {
      // Allow deleting marker if clicked again
      const newWaypoints = [...waypoints];
      newWaypoints.splice(index, 1);
      pushHistory(newWaypoints);
    }
  }

  const handleClear = () => {
    setHistory([[]]);
    setHistoryIndex(0);
    setOsrmRoute([]);
    setGeneratedTrack(null);
  }

  const handleGenerate = async () => {
    if (osrmRoute.length < 2) {
      alert("Draw a route first!")
      return;
    }
    setIsGenerating(true)
    try {
      const startDateTime = new Date(startTimeStr);
      const track = await generateActivity(
        osrmRoute, startDateTime, pace, sport, useRandomStops, pacingStrategy, elevSensitivity, loops
      );
      setGeneratedTrack(track);
    } catch (err) {
      console.error(err)
      alert("Error generating activity.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = () => {
    if (generatedTrack) {
      const tcxData = generateTCX(generatedTrack, sport, deviceKey);
      downloadFile(tcxData, `Kalla_${sport}_${deviceKey}.tcx`);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'tcx' && ext !== 'gpx') return alert("Only .tcx and .gpx supported");

    const reader = new FileReader();
    reader.onload = (event) => {
      const xml = event.target?.result as string;
      const parsedTrack = parseActivityFile(xml, ext);
      if (parsedTrack.length > 0) {
        // Simplify trackpoints into waypoints using basic Douglas-Peucker via Leaflet
        // Convert to Leaflet Points for simplification (treating lat/lng as x/y)
        const pts = parsedTrack.map(p => L.point(p.lat, p.lng));
        const tolerance = 0.001; // roughly 100m
        const simplifiedPts = L.LineUtil.simplify(pts, tolerance);
        
        const importedWaypoints = simplifiedPts.map(p => ({
          lat: p.x, lng: p.y, snapped: false
        }));
        
        pushHistory(importedWaypoints);
        setGeneratedTrack(null);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  }

  return (
    <div className="app-layout" style={{ display: 'flex' }}>
      {/* Map Background */}
      <MapContainer center={[-6.2088, 106.8456]} zoom={13} zoomControl={false} style={{ flex: 1 }}>
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
        {osrmRoute.length > 0 && <MapBoundsController route={osrmRoute} />}
        
        {waypoints.map((wp, i) => (
          <Marker key={i} position={wp} eventHandlers={{ click: () => handleMarkerClick(i) }} />
        ))}
        {osrmRoute.length > 0 && (
          <Polyline positions={osrmRoute} color="#09090b" weight={4} opacity={0.8} />
        )}
      </MapContainer>

      {/* Floating Control Panel */}
      <div className="control-panel glass-panel" style={{ width: '420px', overflowY: 'auto', maxHeight: '100vh', margin: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Kalla Realism</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Advanced Spoofing Dashboard</p>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
            Upload GPX/TCX (Edit Route)
            <input type="file" accept=".gpx,.tcx" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button className="btn-secondary" onClick={() => { if(historyIndex>0) setHistoryIndex(historyIndex-1) }} disabled={historyIndex === 0} style={{ flex: 1, padding: '8px' }}>Undo</button>
          <button className="btn-secondary" onClick={() => { if(historyIndex<history.length-1) setHistoryIndex(historyIndex+1) }} disabled={historyIndex === history.length - 1} style={{ flex: 1, padding: '8px' }}>Redo</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          <div>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>Sport Type</label>
              <select value={sport} onChange={(e) => setSport(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '8px' }}>
                <option value="Running">Running</option>
                <option value="Walking">Walking</option>
                <option value="Biking">Biking</option>
              </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500' }}>Target Pace / Speed</label>
            <input type="number" step="0.1" value={pace} onChange={(e) => setPace(parseFloat(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '8px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500' }}>Pacing Strategy</label>
            <select value={pacingStrategy} onChange={(e) => setPacingStrategy(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '8px' }}>
              <option value="Flat">Flat / Steady</option>
              <option value="Progression">Progression</option>
              <option value="Negative Split">Negative Split</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500' }}>Loops (Laps)</label>
            <input type="number" min="1" value={loops} onChange={(e) => setLoops(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '8px' }} />
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
           <label style={{ fontSize: '12px', fontWeight: '500' }}>Device Spoofing (Creator)</label>
           <select value={deviceKey} onChange={(e) => setDeviceKey(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '8px' }}>
             {Object.entries(DEVICES).map(([k, d]) => (
               <option key={k} value={k}>{d.name}</option>
             ))}
           </select>
        </div>

        <div style={{ marginTop: '12px' }}>
           <label style={{ fontSize: '12px', fontWeight: '500' }}>Start Time</label>
           <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="snapToggle" checked={isSnapping} onChange={(e) => setIsSnapping(e.target.checked)} />
            <label htmlFor="snapToggle" style={{ fontSize: '14px', cursor: 'pointer' }}>Snap to Roads</label>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="stopsToggle" checked={useRandomStops} onChange={(e) => setUseRandomStops(e.target.checked)} />
            <label htmlFor="stopsToggle" style={{ fontSize: '14px', cursor: 'pointer' }}>Simulate Stops</label>
          </div>
        </div>

        {!generatedTrack ? (
          <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating || osrmRoute.length < 2} style={{ marginTop: '12px' }}>
            {isGenerating ? 'Simulating Physics...' : 'Generate Analytics'}
          </button>
        ) : (
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={handleDownload} style={{ flex: 1 }}>Download TCX</button>
            <button className="btn-secondary" onClick={() => setGeneratedTrack(null)} style={{ flex: 1 }}>Re-generate</button>
          </div>
        )}

        <button className="btn-secondary" onClick={handleClear} style={{ marginTop: '8px', width: '100%' }}>Clear Map</button>

        {generatedTrack && <Dashboard track={generatedTrack} sport={sport} />}
        
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <p>Waypoints: {waypoints.length} | Nodes: {osrmRoute.length * loops}</p>
        </div>
      </div>
    </div>
  )
}
