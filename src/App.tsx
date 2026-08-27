import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polyline, Marker, LayersControl, useMap } from 'react-leaflet'
import { MousePointer2, PenTool, Undo2, Redo2, Trash2, Lock, Unlock, Upload, Settings2, Download, RefreshCw, Route, Zap } from 'lucide-react'
import { fetchOSRMRoute } from './lib/osrm'
import { generateActivity, type TrackPoint, type PacingStrategy } from './lib/realism-engine'
import { generateTCX, downloadFile, DEVICES } from './lib/tcx-generator'
import { parseActivityFile } from './lib/xml-parser'
import Dashboard from './components/Dashboard'
import L from 'leaflet'
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
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

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function FreehandDrawer({ isFreehandMode, onFreehandComplete }: { isFreehandMode: boolean, onFreehandComplete: (pts: {lat: number, lng: number}[]) => void }) {
  const map = useMap();
  const [points, setPoints] = useState<{lat: number, lng: number}[]>([]);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<{lat: number, lng: number}[]>([]);

  useEffect(() => {
    if (isFreehandMode) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
    return () => { map.dragging.enable(); }
  }, [isFreehandMode, map]);

  useEffect(() => {
    if (!isFreehandMode) return;

    const container = map.getContainer();
    container.style.touchAction = 'none';

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      isDrawingRef.current = true;
      const latlng = map.mouseEventToLatLng(e);
      pointsRef.current = [{lat: latlng.lat, lng: latlng.lng}];
      setPoints([...pointsRef.current]);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current || !e.isPrimary) return;
      const latlng = map.mouseEventToLatLng(e);
      pointsRef.current.push({lat: latlng.lat, lng: latlng.lng});
      setPoints([...pointsRef.current]);
    };

    const onPointerUp = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      onFreehandComplete(pointsRef.current);
      pointsRef.current = [];
      setPoints([]);
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    return () => {
      container.style.touchAction = '';
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [isFreehandMode, map, onFreehandComplete]);

  if (!isFreehandMode || points.length < 2) return null;
  return <Polyline positions={points} color="#ef4444" weight={4} dashArray="8,8" opacity={0.6} />;
}

export default function App() {
  const [history, setHistory] = useState<Waypoint[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [osrmRoute, setOsrmRoute] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedTrack, setGeneratedTrack] = useState<TrackPoint[] | null>(null)
  
  // Customization States
  const [paceMin, setPaceMin] = useState(6)
  const [paceSec, setPaceSec] = useState(30)
  const [speedKmh, setSpeedKmh] = useState(25)

  const [isSnapping] = useState(true)
  const [sport, setSport] = useState<'Running' | 'Walking' | 'Biking'>('Running')
  const [startTimeStr, setStartTimeStr] = useState(getDefaultDateTime())
  const [useRandomStops, setUseRandomStops] = useState(false)
  const [loops, setLoops] = useState(1)
  const [pacingStrategy, setPacingStrategy] = useState<PacingStrategy>('Flat')
  const [deviceKey, setDeviceKey] = useState<keyof typeof DEVICES>('garmin945')
  
  const [includeHR, setIncludeHR] = useState(true)
  const [includePowerCadence, setIncludePowerCadence] = useState(true)
  const [targetHR, setTargetHR] = useState(140)
  const [gpsAccuracy, setGpsAccuracy] = useState<'Perfect'|'Good'|'Poor'>('Good')

  // UI States
  const [isPanelExpanded, setIsPanelExpanded] = useState(true)
  const [appMode, setAppMode] = useState<'draw' | 'upload'>('draw')
  const [drawMode, setDrawMode] = useState<'click' | 'freehand'>('click')
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Premium States
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [secretBypass, setSecretBypass] = useState('')

  useEffect(() => {
    // Secret bypass check: count occurrences of "sangkalaaji"
    const count = (secretBypass.match(/sangkalaaji/gi) || []).length;
    if (count >= 10) {
      setIsPremiumUnlocked(true);
      setShowPremiumModal(false);
      setSecretBypass('');
      alert("Pro Unlocked!");
    }
  }, [secretBypass]);

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

      // Close the loop if multiple loops are requested and the route doesn't close itself
      if (loops > 1 && fullRoute.length > 1) {
        const first = fullRoute[0];
        const last = fullRoute[fullRoute.length - 1];
        if (getDistance(first.lat, first.lng, last.lat, last.lng) > 10) { // more than 10 meters gap
          const profile = sport === 'Biking' ? 'cycling' : 'walking';
          const segment = await fetchOSRMRoute([{ lat: last.lat, lng: last.lng }, { lat: first.lat, lng: first.lng }], profile);
          if (segment && segment.length > 0) {
            segment.shift();
            fullRoute = [...fullRoute, ...segment];
          } else {
            fullRoute.push({ lat: first.lat, lng: first.lng });
          }
        }
      }

      setOsrmRoute(fullRoute);
      setGeneratedTrack(null); 
    };

    calculateRoute();
  }, [waypoints, sport, loops]); 

  const setQuickDistance = (targetKm: number) => {
    if (osrmRoute.length < 2) return alert("Gambar rute dulu!");
    let loopDist = 0;
    for(let i = 1; i < osrmRoute.length; i++){
       loopDist += getDistance(osrmRoute[i-1].lat, osrmRoute[i-1].lng, osrmRoute[i].lat, osrmRoute[i].lng);
    }
    const reqLoops = Math.max(1, Math.ceil((targetKm * 1000) / loopDist));
    setLoops(reqLoops);
  }

  const pushHistory = (newWaypoints: Waypoint[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newWaypoints);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleMapClick = (latlng: any) => {
    if (drawMode !== 'click') return;
    const newWaypoint: Waypoint = { lat: latlng.lat, lng: latlng.lng, snapped: isSnapping };
    pushHistory([...waypoints, newWaypoint]);
  }

  const handleFreehandComplete = (rawPoints: {lat: number, lng: number}[]) => {
    if (rawPoints.length < 2) return;
    const pts = rawPoints.map(p => L.point(p.lat, p.lng));
    // Simplify heavily so OSRM doesn't complain about too many waypoints
    const simplifiedPts = L.LineUtil.simplify(pts, 0.0008); 
    const newWps = simplifiedPts.map(p => ({ lat: p.x, lng: p.y, snapped: isSnapping }));
    pushHistory([...waypoints, ...newWps]);
  }

  const handleMarkerClick = (index: number) => {
    if (index === 0 && waypoints.length > 2) {
      const firstWP = waypoints[0];
      const newWaypoint: Waypoint = { lat: firstWP.lat, lng: firstWP.lng, snapped: isSnapping };
      pushHistory([...waypoints, newWaypoint]);
    } else {
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
      const paceDecimal = sport === 'Biking' ? (60 / speedKmh) : (paceMin + paceSec / 60);
      
      const track = await generateActivity(
        osrmRoute, startDateTime, paceDecimal, sport, useRandomStops, pacingStrategy, 1.0, loops, includeHR, includePowerCadence, targetHR, gpsAccuracy
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
        const pts = parsedTrack.map(p => L.point(p.lat, p.lng));
        const tolerance = 0.001;
        const simplifiedPts = L.LineUtil.simplify(pts, tolerance);
        
        const importedWaypoints = simplifiedPts.map(p => ({
          lat: p.x, lng: p.y, snapped: true // Auto-snap TCX uploads
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
        <FreehandDrawer isFreehandMode={drawMode === 'freehand'} onFreehandComplete={handleFreehandComplete} />
        {osrmRoute.length > 0 && <MapBoundsController route={osrmRoute} />}
        
        {waypoints.map((wp, i) => (
          <Marker key={i} position={wp} eventHandlers={{ click: () => handleMarkerClick(i) }} />
        ))}
        {osrmRoute.length > 0 && (
          <Polyline positions={osrmRoute} color="#fc4c02" weight={5} opacity={0.9} />
        )}
      </MapContainer>

      {appMode === 'draw' && (
        <div className="floating-toolbar">
          <div className="floating-btn-group">
            <button className={drawMode === 'click' ? 'active' : ''} onClick={() => setDrawMode('click')} title="Tap / Click">
              <MousePointer2 size={18} /> Tap
            </button>
            <button className={drawMode === 'freehand' ? 'active' : ''} onClick={() => setDrawMode('freehand')} title="Freehand">
              <PenTool size={18} /> Freehand
            </button>
          </div>
          <div className="floating-btn-group">
            <button onClick={() => { if(historyIndex>0) setHistoryIndex(historyIndex-1) }} disabled={historyIndex === 0} title="Undo">
              <Undo2 size={18} /> Undo
            </button>
            <button onClick={() => { if(historyIndex<history.length-1) setHistoryIndex(historyIndex+1) }} disabled={historyIndex === history.length - 1} title="Redo">
              <Redo2 size={18} /> Redo
            </button>
            <button onClick={handleClear} style={{ color: '#ef4444' }} title="Clear All">
              <Trash2 size={18} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Floating Control Panel */}
      <div className={`control-panel solid-panel ${!isPanelExpanded ? 'collapsed' : ''}`}>
        <div className="panel-drag-handle" onClick={() => setIsPanelExpanded(!isPanelExpanded)}></div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px', borderRadius: '12px', marginBottom: '16px' }}>
          <button 
            style={{ flex: 1, padding: '10px', borderRadius: '8px', background: appMode === 'draw' ? 'var(--bg-primary)' : 'transparent', color: appMode === 'draw' ? 'var(--text-primary)' : 'var(--text-secondary)' }} 
            onClick={() => setAppMode('draw')}>
            Draw Route
          </button>
          <button 
            style={{ flex: 1, padding: '10px', borderRadius: '8px', background: appMode === 'upload' ? 'var(--bg-primary)' : 'transparent', color: appMode === 'upload' ? 'var(--text-primary)' : 'var(--text-secondary)' }} 
            onClick={() => setAppMode('upload')}>
            Upload File
          </button>
        </div>

        {appMode === 'upload' && (
          <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px', textAlign: 'center' }}>
            <label className="btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer', padding: '12px 24px', borderRadius: '100px' }}>
              <Upload size={18} style={{ marginRight: '8px' }} /> Select GPX / TCX
              <input type="file" accept=".gpx,.tcx" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>File will be auto-snapped to roads.</p>
          </div>
        )}

        {appMode === 'draw' && (
          <div className="settings-group">
            <div className="settings-item">
              <div className="settings-item-label">
                <Route size={16} color="var(--text-secondary)" />
                Quick Distance
              </div>
              <div className="settings-item-value" style={{ gap: '2px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
                {[5, 10, 21, 42].map(km => (
                  <button key={km} onClick={() => setQuickDistance(km)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: 'var(--text-primary)' }}>
                    {km}K
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-item">
              <div className="settings-item-label">Sport</div>
              <div className="settings-item-value">
                <select value={sport} onChange={(e) => setSport(e.target.value as any)}>
                  <option value="Running">Running</option>
                  <option value="Walking">Walking</option>
                  <option value="Biking">Biking</option>
                </select>
              </div>
            </div>
            
            <div className="settings-item">
              <div className="settings-item-label">Target Pace/Speed</div>
              <div className="settings-item-value">
                {sport === 'Biking' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" step="0.1" value={speedKmh} onChange={(e) => setSpeedKmh(parseFloat(e.target.value))} style={{ maxWidth: '40px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>km/h</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" min="1" max="60" value={paceMin} onChange={(e) => setPaceMin(parseInt(e.target.value))} style={{ maxWidth: '30px' }} />
                    <span>:</span>
                    <input type="number" min="0" max="59" value={paceSec} onChange={(e) => setPaceSec(parseInt(e.target.value))} style={{ maxWidth: '30px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>/km</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="settings-group">
          <div className="settings-item" onClick={() => !isPremiumUnlocked && setShowPremiumModal(true)} style={{ cursor: !isPremiumUnlocked ? 'pointer' : 'default' }}>
            <div className="settings-item-label">
              {!isPremiumUnlocked ? <Lock size={16} color="#ef4444" /> : <Unlock size={16} color="#10b981" />}
              Device Spoofing
            </div>
            <div className="settings-item-value">
              <select value={deviceKey} onChange={(e) => setDeviceKey(e.target.value as any)} disabled={!isPremiumUnlocked}>
                {Object.entries(DEVICES).map(([k, d]) => (
                  <option key={k} value={k}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="settings-item" onClick={() => !isPremiumUnlocked && setShowPremiumModal(true)} style={{ cursor: !isPremiumUnlocked ? 'pointer' : 'default' }}>
            <div className="settings-item-label">
              {!isPremiumUnlocked ? <Lock size={16} color="#ef4444" /> : <Unlock size={16} color="#10b981" />}
              Target Avg HR (bpm)
            </div>
            <div className="settings-item-value">
              <input type="number" value={targetHR} onChange={(e) => setTargetHR(parseInt(e.target.value))} disabled={!isPremiumUnlocked} style={{ maxWidth: '50px' }} />
            </div>
          </div>
        </div>

        <button 
          onClick={() => setShowAdvanced(!showAdvanced)} 
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'transparent', color: 'var(--text-secondary)', border: 'none', marginBottom: '16px', cursor: 'pointer' }}>
          <Settings2 size={16} /> {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
        </button>

        {showAdvanced && (
          <div className="settings-group">
            <div className="settings-item">
              <div className="settings-item-label">Pacing Strategy</div>
              <div className="settings-item-value">
                <select value={pacingStrategy} onChange={(e) => setPacingStrategy(e.target.value as any)}>
                  <option value="Flat">Flat</option>
                  <option value="Progression">Progression</option>
                  <option value="Negative Split">Negative Split</option>
                </select>
              </div>
            </div>
            <div className="settings-item">
              <div className="settings-item-label">GPS Accuracy</div>
              <div className="settings-item-value">
                <select value={gpsAccuracy} onChange={(e) => setGpsAccuracy(e.target.value as any)}>
                  <option value="Perfect">Perfect (Dual-Band)</option>
                  <option value="Good">Good (Phone)</option>
                  <option value="Poor">Poor (City)</option>
                </select>
              </div>
            </div>
            <div className="settings-item">
              <div className="settings-item-label">Start Time</div>
              <div className="settings-item-value">
                <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} style={{ maxWidth: '180px' }} />
              </div>
            </div>
            
            <div className="settings-item">
              <div className="settings-item-label">Simulate Stops</div>
              <div className="settings-item-value">
                <input type="checkbox" checked={useRandomStops} onChange={(e) => setUseRandomStops(e.target.checked)} />
              </div>
            </div>
            
            <div className="settings-item" onClick={() => !isPremiumUnlocked && setShowPremiumModal(true)} style={{ cursor: !isPremiumUnlocked ? 'pointer' : 'default' }}>
              <div className="settings-item-label">
                {!isPremiumUnlocked ? <Lock size={16} color="#ef4444" /> : <Unlock size={16} color="#10b981" />}
                Include HR
              </div>
              <div className="settings-item-value">
                <input type="checkbox" checked={includeHR} onChange={(e) => setIncludeHR(e.target.checked)} disabled={!isPremiumUnlocked} />
              </div>
            </div>

            <div className="settings-item" onClick={() => !isPremiumUnlocked && setShowPremiumModal(true)} style={{ cursor: !isPremiumUnlocked ? 'pointer' : 'default' }}>
              <div className="settings-item-label">
                {!isPremiumUnlocked ? <Lock size={16} color="#ef4444" /> : <Unlock size={16} color="#10b981" />}
                Power/Cadence
              </div>
              <div className="settings-item-value">
                <input type="checkbox" checked={includePowerCadence} onChange={(e) => setIncludePowerCadence(e.target.checked)} disabled={!isPremiumUnlocked} />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {!generatedTrack ? (
            <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating || osrmRoute.length < 2} style={{ padding: '16px', fontSize: '14px', borderRadius: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              {isGenerating ? 'Simulating Physics...' : 'Generate Analytics'} <Zap size={18} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-primary" onClick={handleDownload} style={{ flex: 1, padding: '16px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                Download TCX <Download size={18} />
              </button>
              <button className="btn-secondary" onClick={() => setGeneratedTrack(null)} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px' }}>
                Re-generate <RefreshCw size={18} />
              </button>
            </div>
          )}
          
          {generatedTrack && (
             <a href="https://www.strava.com/upload/select" target="_blank" rel="noreferrer" className="btn-secondary" style={{ display: 'flex', justifyContent: 'center', gap: '8px', textDecoration: 'none', background: '#fc4c02', color: 'white', border: 'none', padding: '16px', borderRadius: '12px' }}>
               Upload to Strava
             </a>
          )}
        </div>

        {generatedTrack && <Dashboard track={generatedTrack} sport={sport} />}
      </div>

      {showPremiumModal && (
        <div className="modal-overlay" onClick={() => setShowPremiumModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <Lock size={48} color="#fc4c02" style={{ marginBottom: '16px' }} />
            <h2 style={{ margin: '0 0 12px 0', fontSize: '20px' }}>Pro Features Locked</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Buka fitur Spoofing Device & Target Heart Rate untuk simulasi yang 100% mirip aslinya.
            </p>
            <a href="https://saweria.co/sangkalaaji" target="_blank" rel="noreferrer" style={{ display: 'inline-block', width: '100%', padding: '12px', background: '#fc4c02', color: '#fff', borderRadius: '12px', textDecoration: 'none', fontWeight: 'bold', marginBottom: '16px' }}>
              Support via Saweria
            </a>
            
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Atau ketik rahasia "sangkalaaji" 10x di bawah untuk gratis:</p>
              <textarea 
                value={secretBypass} 
                onChange={e => setSecretBypass(e.target.value)} 
                placeholder="Ketik di sini..."
                style={{ width: '100%', height: '80px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', color: 'var(--text-primary)', resize: 'none' }}
              />
            </div>
            
            <button onClick={() => setShowPremiumModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', marginTop: '16px', cursor: 'pointer', fontSize: '14px' }}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
