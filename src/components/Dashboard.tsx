import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { TrackPoint } from '../lib/realism-engine';

interface Props {
  track: TrackPoint[];
  sport: string;
}

export default function Dashboard({ track, sport }: Props) {
  if (!track || track.length === 0) return null;

  let totalDistance = track[track.length - 1].distance;
  let totalTimeMs = new Date(track[track.length - 1].time).getTime() - new Date(track[0].time).getTime();
  
  let movingTimeMs = 0;
  let maxHr = 0;
  let sumHr = 0;
  let hrCount = 0;
  let maxElev = track[0].elevation || 0;
  let elevGain = 0;
  
  const splits: { km: number; paceStr: string; paceSeconds: number; elev: number }[] = [];
  let currentSplitKm = 1;
  let splitStartTime = new Date(track[0].time).getTime();
  let splitStartElev = track[0].elevation || 0;
  
  for (let i = 1; i < track.length; i++) {
    const p1 = track[i - 1];
    const p2 = track[i];
    
    const timeDiff = new Date(p2.time).getTime() - new Date(p1.time).getTime();
    const distDiff = p2.distance - p1.distance;
    
    if (distDiff > 0 && (distDiff / (timeDiff / 1000)) > 0.5) {
      movingTimeMs += timeDiff;
    }

    if (p2.hr !== undefined) {
      if (p2.hr > maxHr) maxHr = p2.hr;
      sumHr += p2.hr;
      hrCount++;
    }
    
    const elev = p2.elevation || 0;
    if (elev > maxElev) maxElev = elev;
    const elevDiff = elev - (p1.elevation || 0);
    if (elevDiff > 0) elevGain += elevDiff;

    if (p2.distance >= currentSplitKm * 1000 || i === track.length - 1) {
      const splitTimeSec = (new Date(p2.time).getTime() - splitStartTime) / 1000;
      const splitDistKm = (p2.distance - ((currentSplitKm - 1) * 1000)) / 1000;
      
      if (splitDistKm > 0) {
        let paceSecPerKm = splitTimeSec / splitDistKm;
        let paceStr = '';
        if (sport === 'Biking') {
          paceStr = (3600 / paceSecPerKm).toFixed(1) + ' km/h';
        } else {
          const mins = Math.floor(paceSecPerKm / 60);
          const secs = Math.floor(paceSecPerKm % 60);
          paceStr = `${mins}:${secs.toString().padStart(2, '0')} /km`;
        }
        
        splits.push({
          km: currentSplitKm,
          paceStr,
          paceSeconds: paceSecPerKm,
          elev: Math.round(elev - splitStartElev)
        });
      }

      currentSplitKm++;
      splitStartTime = new Date(p2.time).getTime();
      splitStartElev = elev;
    }
  }

  const avgHr = hrCount > 0 ? Math.round(sumHr / hrCount) : 0;
  
  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
  };

  const formatPace = (ms: number, dist: number) => {
    const distKm = dist / 1000;
    if (distKm === 0) return '-';
    const paceSecPerKm = (ms / 1000) / distKm;
    if (sport === 'Biking') return (3600 / paceSecPerKm).toFixed(1) + ' km/h';
    const mins = Math.floor(paceSecPerKm / 60);
    const secs = Math.floor(paceSecPerKm % 60);
    return `${mins}:${secs.toString().padStart(2, '0')} /km`;
  };

  let fastestSplit = splits.length > 0 ? splits[0] : null;
  if (sport === 'Biking') {
    fastestSplit = splits.reduce((prev, current) => (prev.paceSeconds < current.paceSeconds ? prev : current), splits[0]);
  } else {
    fastestSplit = splits.reduce((prev, current) => (prev.paceSeconds < current.paceSeconds ? prev : current), splits[0]);
  }

  const maxPoints = 150;
  const step = Math.max(1, Math.floor(track.length / maxPoints));
  const chartData = track.filter((_, i) => i % step === 0).map(tp => ({
    distKm: (tp.distance / 1000).toFixed(2),
    hr: tp.hr,
    elevation: tp.elevation || 0,
    cadence: tp.cadence,
    power: tp.power
  }));

  const hasHR = chartData.some(d => d.hr !== undefined);
  const hasCadence = chartData.some(d => d.cadence !== undefined);
  const hasPower = chartData.some(d => d.power !== undefined);

  const StatBox = ({ label, value, sub }: { label: string, value: string, sub?: string }) => (
    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <StatBox label="Jarak Total" value={`${(totalDistance / 1000).toFixed(2)} km`} />
        <StatBox label="Elevasi Gain" value={`${Math.round(elevGain)} m`} sub={`Maks: ${Math.round(maxElev)} m`} />
        
        <StatBox label="Waktu Bergerak" value={formatTime(movingTimeMs)} sub={`Total: ${formatTime(totalTimeMs)}`} />
        <StatBox label="Avg Pace (Bergerak)" value={formatPace(movingTimeMs, totalDistance)} sub={`Total Pace: ${formatPace(totalTimeMs, totalDistance)}`} />
        
        {hasHR && <StatBox label="Heart Rate" value={`${avgHr} bpm`} sub={`Maks: ${maxHr} bpm`} />}
        <StatBox label="Split Tercepat" value={fastestSplit ? fastestSplit.paceStr : '-'} sub={`Pada KM ${fastestSplit?.km}`} />
      </div>

      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px', textAlign: 'center' }}>Splits</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
          <div>KM</div>
          <div>Pace</div>
          <div>Elev</div>
        </div>
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {splits.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', fontSize: '14px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>{s.km}</div>
              <div>{s.paceStr}</div>
              <div style={{ color: s.elev > 0 ? '#10b981' : (s.elev < 0 ? '#ef4444' : 'var(--text-secondary)') }}>
                {s.elev > 0 ? '+' : ''}{s.elev} m
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Grafik Analisis</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ height: 120 }}>
            <p style={{ fontSize: '12px', color: '#10b981', marginBottom: '4px', fontWeight: 'bold' }}>Elevation (m)</p>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <XAxis dataKey="distKm" hide />
                <YAxis domain={['auto', 'auto']} width={30} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                <Tooltip contentStyle={{ background: '#000', border: 'none', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="elevation" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {hasHR && (
            <div style={{ height: 120 }}>
              <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '4px', fontWeight: 'bold' }}>Heart Rate (bpm)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="distKm" hide />
                  <YAxis domain={['auto', 'auto']} width={30} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: '#000', border: 'none', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {hasPower && (
            <div style={{ height: 120 }}>
              <p style={{ fontSize: '12px', color: '#8b5cf6', marginBottom: '4px', fontWeight: 'bold' }}>Power (W)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="distKm" hide />
                  <YAxis domain={['auto', 'auto']} width={30} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: '#000', border: 'none', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="power" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {hasCadence && (
            <div style={{ height: 120 }}>
              <p style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '4px', fontWeight: 'bold' }}>Cadence ({sport === 'Biking' ? 'RPM' : 'SPM'})</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="distKm" hide />
                  <YAxis domain={['auto', 'auto']} width={30} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: '#000', border: 'none', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="cadence" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
