import { useEffect, useState } from 'react';
import { getActivities, type ActivityBlueprint } from '../lib/firebase';
import { generateActivity } from '../lib/realism-engine';
import { generateTCX, generateGPX, downloadFile } from '../lib/tcx-generator';
import { Download, RefreshCw, ArrowLeft } from 'lucide-react';

export default function AdminDashboard() {
  const [activities, setActivities] = useState<ActivityBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  useEffect(() => {
    getActivities().then(data => {
      setActivities(data);
      setLoading(false);
    });
  }, []);

  const handleRegenerateAndDownload = async (activity: ActivityBlueprint, index: number, format: 'tcx' | 'gpx') => {
    setGeneratingId(index);
    try {
      const startDateTime = new Date(activity.startTimeStr);
      const paceDecimal = activity.sport === 'Biking' ? (60 / activity.speedKmh) : (activity.paceMin + activity.paceSec / 60);
      
      const track = await generateActivity(
        activity.osrmRoute, 
        startDateTime, 
        paceDecimal, 
        activity.sport as any, 
        activity.useRandomStops, 
        activity.pacingStrategy as any, 
        1.0, 
        activity.loops, 
        activity.includeHR, 
        activity.includePowerCadence, 
        activity.targetHR, 
        activity.gpsAccuracy as any
      );

      if (format === 'tcx') {
        const tcx = generateTCX(track, activity.deviceKey as any);
        downloadFile(tcx, `admin_fake_${activity.sport}.tcx`, 'application/xml');
      } else {
        const gpx = generateGPX(track, activity.deviceKey as any);
        downloadFile(gpx, `admin_fake_${activity.sport}.gpx`, 'application/gpx+xml');
      }
    } catch (err) {
      console.error(err);
      alert("Error generating activity.");
    }
    setGeneratingId(null);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px', background: 'var(--bg-primary)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <button onClick={() => window.location.hash = ''} style={{ background: 'var(--bg-tertiary)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} color="var(--text-primary)" />
        </button>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Sangkala Admin Dashboard</h1>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', opacity: 0.5 }}>Memuat data dari Firestore...</p>
      ) : activities.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.5 }}>Belum ada rute yang diunduh.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activities.map((act, idx) => (
            <div key={idx} style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(act.createdAt).toLocaleString('id-ID')}</div>
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                    {act.distance_km ? act.distance_km.toFixed(2) : '?'} km • {act.sport}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', background: act.isPremiumUnlocked ? '#10b981' : '#a1a1aa', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                    {act.isPremiumUnlocked ? 'Premium' : 'Free'}
                  </span>
                  <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>{act.deviceKey}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
                <div><strong>Pace:</strong> {act.sport === 'Biking' ? `${act.speedKmh} km/h` : `${act.paceMin}:${act.paceSec.toString().padStart(2, '0')}/km`}</div>
                <div><strong>Loops:</strong> {act.loops}</div>
                <div><strong>Target HR:</strong> {act.includeHR ? act.targetHR : 'Off'}</div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => handleRegenerateAndDownload(act, idx, 'tcx')} 
                  disabled={generatingId !== null}
                  className="btn-primary" 
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {generatingId === idx ? <RefreshCw size={14} className="spin" /> : <Download size={14} />} TCX
                </button>
                <button 
                  onClick={() => handleRegenerateAndDownload(act, idx, 'gpx')} 
                  disabled={generatingId !== null}
                  className="btn-secondary" 
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                  {generatingId === idx ? <RefreshCw size={14} className="spin" /> : <Download size={14} />} GPX
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
