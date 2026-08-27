import type { TrackPoint } from './realism-engine';

export const DEVICES = {
  generic: { name: 'Generic / Unknown (Free)', author: null },
  garmin945: { name: 'Garmin Forerunner 945', productId: '3113' },
  garminFenix7: { name: 'Garmin Fenix 7', productId: '3900' },
  garminEdge530: { name: 'Garmin Edge 530', productId: '3121' },
  suunto9: { name: 'Suunto 9 Peak', productId: '0' },
  corosPace2: { name: 'COROS PACE 2', productId: '0' },
  corosApex2: { name: 'COROS APEX 2 Pro', productId: '0' },
  appleWatch: { name: 'Apple Watch Ultra', productId: '0' },
  wahooElemnt: { name: 'Wahoo ELEMNT RIVAL', productId: '0' },
  polarVantage: { name: 'Polar Vantage V2', productId: '0' },
  amazfitTRex: { name: 'Amazfit T-Rex 2', productId: '0' },
  igpsport: { name: 'iGPSPORT iGS630', productId: '0' }
};

function generateTrackpointsTCX(track: TrackPoint[]): string {
  return track.map(tp => `
          <Trackpoint>
            <Time>${new Date(tp.time).toISOString()}</Time>
            <Position>
              <LatitudeDegrees>${tp.lat.toFixed(7)}</LatitudeDegrees>
              <LongitudeDegrees>${tp.lng.toFixed(7)}</LongitudeDegrees>
            </Position>
            ${tp.elevation !== undefined ? `<AltitudeMeters>${tp.elevation.toFixed(1)}</AltitudeMeters>` : ''}
            <DistanceMeters>${tp.distance.toFixed(2)}</DistanceMeters>
            ${tp.hr !== undefined ? `
            <HeartRateBpm>
              <Value>${tp.hr}</Value>
            </HeartRateBpm>` : ''}
          </Trackpoint>`).join('');
}

export function generateTCX(track: TrackPoint[], deviceKey: keyof typeof DEVICES = 'generic'): string {
  if (track.length === 0) return '';
  const device = DEVICES[deviceKey] || DEVICES['generic'];
  
  let authorBlock = '';
  const devAuthor = (device as any).author;
  if (devAuthor) {
    authorBlock = `
    <Author xsi:type="Application_t">
      <Name>${devAuthor.name}</Name>
      <Build>
        <Version>
          <VersionMajor>${devAuthor.versionMajor}</VersionMajor>
          <VersionMinor>${devAuthor.versionMinor}</VersionMinor>
          <BuildMajor>${devAuthor.buildMajor}</BuildMajor>
          <BuildMinor>${devAuthor.buildMinor}</BuildMinor>
        </Version>
      </Build>
      <LangID>en</LangID>
      <PartNumber>${devAuthor.partNumber}</PartNumber>
    </Author>`;
  }

  const tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="${track[0]?.cadence !== undefined ? 'Running' : 'Biking'}">
      <Id>${new Date(track[0].time).toISOString()}</Id>
      <Lap StartTime="${new Date(track[0].time).toISOString()}">
        <TotalTimeSeconds>${(new Date(track[track.length-1].time).getTime() - new Date(track[0].time).getTime()) / 1000}</TotalTimeSeconds>
        <DistanceMeters>${track[track.length-1].distance}</DistanceMeters>
        <Calories>${Math.round(track[track.length-1].distance / 1000 * 60)}</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          ${generateTrackpointsTCX(track)}
        </Track>
      </Lap>
    </Activity>
  </Activities>${authorBlock}
</TrainingCenterDatabase>`;
  
  return tcx;
}

export function generateGPX(track: TrackPoint[], deviceKey: keyof typeof DEVICES = 'generic'): string {
  const device = DEVICES[deviceKey] || DEVICES['generic'];
  const devAuthor = (device as any).author;
  const creator = devAuthor ? devAuthor.name : "MapMaker Free";

  const trkpts = track.map(p => {
    let ext = '';
    if (p.hr || p.cadence || p.power) {
      ext = `
        <extensions>
          <TrackPointExtension xmlns="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
            ${p.hr ? `<hr>${Math.round(p.hr)}</hr>` : ''}
            ${p.cadence ? `<cad>${Math.round(p.cadence)}</cad>` : ''}
          </TrackPointExtension>
          ${p.power ? `<power>${Math.round(p.power)}</power>` : ''}
        </extensions>`;
    }
    return `
      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">
        <ele>${p.elevation?.toFixed(1) || 0}</ele>
        <time>${new Date(p.time).toISOString()}</time>${ext}
      </trkpt>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="${creator}" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <time>${new Date(track[0].time).toISOString()}</time>
  </metadata>
  <trk>
    <name>Simulated Activity</name>
    <type>1</type>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadFile(content: string, filename: string, type: string = 'application/xml') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
