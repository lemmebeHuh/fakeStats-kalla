import type { TrackPoint } from './realism-engine';

export const DEVICES = {
  none: {
    name: 'None',
    productId: '0'
  },
  garmin945: {
    name: 'Garmin Forerunner 945',
    productId: '3113'
  },
  garminFenix7: {
    name: 'Garmin Fenix 7',
    productId: '3900'
  },
  suunto9: {
    name: 'Suunto 9 Peak',
    productId: '0' 
  },
  corosPace2: {
    name: 'COROS PACE 2',
    productId: '0'
  },
  appleWatch: {
    name: 'Apple Watch Ultra',
    productId: '0'
  }
};

export function generateTCX(track: TrackPoint[], sport: string = 'Running', deviceKey: keyof typeof DEVICES = 'garmin945'): string {
  if (track.length === 0) return '';
  const startTime = track[0].time;
  const totalTimeSeconds = (new Date(track[track.length - 1].time).getTime() - new Date(startTime).getTime()) / 1000;
  const totalDistance = track[track.length - 1].distance;
  const device = DEVICES[deviceKey] || DEVICES.garmin945;
  
  let trackpointsXML = track.map(tp => `
          <Trackpoint>
            <Time>${tp.time}</Time>
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
            ${sport === 'Biking' && tp.cadence !== undefined ? `<Cadence>${tp.cadence}</Cadence>` : ''}
            ${(tp.power !== undefined || (sport !== 'Biking' && tp.cadence !== undefined)) ? `
            <Extensions>
              <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                ${tp.power !== undefined ? `<Watts>${tp.power}</Watts>` : ''}
                ${sport !== 'Biking' && tp.cadence !== undefined ? `<RunCadence>${Math.round(tp.cadence / 2)}</RunCadence>` : ''}
              </TPX>
            </Extensions>` : ''}
          </Trackpoint>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase 
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
>
  <Activities>
    <Activity Sport="${sport}">
      <Id>${startTime}</Id>
      <Lap StartTime="${startTime}">
        <TotalTimeSeconds>${totalTimeSeconds.toFixed(1)}</TotalTimeSeconds>
        <DistanceMeters>${totalDistance.toFixed(2)}</DistanceMeters>
        <Calories>450</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpointsXML}
        </Track>
      </Lap>
      ${deviceKey !== 'none' ? `
      <Creator xsi:type="Device_t">
        <Name>${device.name}</Name>
        <UnitId>3311990000</UnitId>
        <ProductID>${device.productId}</ProductID>
        <Version>
          <VersionMajor>11</VersionMajor>
          <VersionMinor>60</VersionMinor>
          <BuildMajor>0</BuildMajor>
          <BuildMinor>0</BuildMinor>
        </Version>
      </Creator>` : ''}
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
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
