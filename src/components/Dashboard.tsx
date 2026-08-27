import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { TrackPoint } from '../lib/realism-engine'

interface DashboardProps {
  track: TrackPoint[]
  sport: 'Running' | 'Walking' | 'Biking'
}

export default function Dashboard({ track, sport }: DashboardProps) {
  const stats = useMemo(() => {
    if (!track || track.length < 2) return null;

    let totalDistance = 0;
    let totalElevGain = 0;
    let maxElev = -Infinity;
    let minElev = Infinity;
    
    let hrSum = 0;
    let hrCount = 0;
    let maxHr = 0;

    const movingThresholdMPS = 0.5;
    let movingTimeMs = 0;
    
    const chartData = [];
    const splitsMap = new Map<number, { timeMs: number, elevGain: number, startElev: number, endElev: number }>();
    
    for (let i = 1; i < track.length; i++) {
      const p1 = track[i-1];
      const p2 = track[i];
      
      const distDiff = p2.distance - p1.distance;
      totalDistance = p2.distance;
      
      const timeDiff = new Date(p2.time).getTime() - new Date(p1.time).getTime();
      const speed = distDiff / (timeDiff / 1000);
      
      if (speed > movingThresholdMPS) {
        movingTimeMs += timeDiff;
      }
      
      const e1 = p1.elevation || 0;
      const e2 = p2.elevation || 0;
      if (e2 > e1) totalElevGain += (e2 - e1);
      
      maxElev = Math.max(maxElev, e2);
      minElev = Math.min(minElev, e2);
      
      if (p2.hr) {
        hrSum += p2.hr;
        hrCount++;
        maxHr = Math.max(maxHr, p2.hr);
      }
      
      if (i % Math.ceil(track.length / 100) === 0 || i === track.length - 1) {
        chartData.push({
          distStr: (p2.distance / 1000).toFixed(2),
          ele: Math.round(e2),
          hr: p2.hr || 0,
          pwr: p2.power || 0,
          cad: p2.cadence || 0
        });
      }

      // Splits calculation
      const currentKm = Math.floor(p2.distance / 1000);
      if (currentKm > 0) {
        if (!splitsMap.has(currentKm)) {
          splitsMap.set(currentKm, { timeMs: 0, elevGain: 0, startElev: e1, endElev: e2 });
        }
        const split = splitsMap.get(currentKm)!;
        if (speed > movingThresholdMPS) {
           split.timeMs += timeDiff;
        }
        if (e2 > e1) split.elevGain += (e2 - e1);
        split.endElev = e2;
      }
    }

    const totalTimeMs = new Date(track[track.length-1].time).getTime() - new Date(track[0].time).getTime();
    
    const splits = Array.from(splitsMap.entries()).map(([km, data]) => {
      const paceMsPerKm = data.timeMs;
      return {
        km,
        pace: paceMsPerKm,
        paceStr: formatPace(paceMsPerKm, 1000),
        elev: Math.round(data.elevGain)
      }
    }).filter(s => s.pace > 0);
    
    let fastestSplit = splits.length > 0 ? splits[0] : null;
    splits.forEach(s => {
      if (s.pace < fastestSplit!.pace) fastestSplit = s;
    });

    const hasHR = hrCount > 0;
    const avgHr = hasHR ? Math.round(hrSum / hrCount) : 0;

    const avgSpeed = (totalDistance / 1000) / (movingTimeMs / 3600000);

    return {
      totalDistance,
      totalTimeMs,
      movingTimeMs,
      elevGain: totalElevGain,
      maxElev,
      minElev,
      hasHR,
      avgHr,
      maxHr,
      chartData,
      splits,
      fastestSplit,
      avgSpeed: avgSpeed.toFixed(1)
    }
  }, [track, sport]);

  if (!stats) return null;

  const { totalDistance, movingTimeMs, elevGain, maxElev, hasHR, avgHr, maxHr, chartData, splits, avgSpeed } = stats;

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
      <h2 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Simulation Stats</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{(totalDistance / 1000).toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>km</span></p>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Elev Gain</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{Math.round(elevGain)} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>m</span></p>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Elev Max</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{Math.round(maxElev)} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>m</span></p>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{formatTime(movingTimeMs)}</p>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Pace</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{formatPace(movingTimeMs, totalDistance)} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>/km</span></p>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Speed</p>
          <p style={{ fontSize: '18px', fontWeight: '700' }}>{avgSpeed} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>km/h</span></p>
        </div>
        {hasHR && (
          <>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg HR</p>
              <p style={{ fontSize: '18px', fontWeight: '700' }}>{avgHr} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>bpm</span></p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max HR</p>
              <p style={{ fontSize: '18px', fontWeight: '700' }}>{maxHr} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>bpm</span></p>
            </div>
          </>
        )}
      </div>

      <div style={{ height: '120px', width: '100%', marginBottom: '24px' }}>
        <p style={{ fontSize: '11px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Elevation Profile</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="distStr" hide />
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }} />
            <Line type="monotone" dataKey="ele" stroke="#a1a1aa" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasHR && (
        <div style={{ height: '120px', width: '100%', marginBottom: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Heart Rate</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="distStr" hide />
              <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
              <Tooltip contentStyle={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }} />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {splits.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Splits</p>
          <div style={{ fontSize: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              <div style={{ width: '40px' }}>KM</div>
              <div style={{ flex: 1 }}>Pace</div>
              <div style={{ flex: 1 }}>Elev</div>
            </div>
            {splits.map((s, i) => (
              <div key={i} style={{ display: 'flex', padding: '4px 0' }}>
                <div style={{ width: '40px', fontWeight: '600' }}>{s.km}</div>
                <div style={{ flex: 1 }}>{formatTime(s.pace)}/km</div>
                <div style={{ flex: 1 }}>{s.elev > 0 ? `+${s.elev}` : s.elev}m</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPace(timeMs: number, distanceM: number) {
  if (distanceM === 0) return '0:00';
  const paceSecPerKm = (timeMs / 1000) / (distanceM / 1000);
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.floor(paceSecPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
