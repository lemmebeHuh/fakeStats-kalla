
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import type { TrackPoint } from '../lib/realism-engine';

interface Props {
  track: TrackPoint[];
  sport: string;
}

export default function Dashboard({ track, sport }: Props) {
  if (!track || track.length === 0) return null;

  const maxPoints = 150;
  const step = Math.max(1, Math.floor(track.length / maxPoints));
  
  const chartData = track.filter((_, i) => i % step === 0).map(tp => {
    return {
      distKm: (tp.distance / 1000).toFixed(2),
      hr: tp.hr,
      elevation: tp.elevation || 0,
      cadence: tp.cadence || 0,
      power: tp.power || 0
    };
  });

  return (
    <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', marginTop: '16px', border: '1px solid var(--border-color)' }}>
      <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Activity Analytics</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

        {sport !== 'Walking' && (
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
      </div>
    </div>
  );
}
