import { TrackPoint } from './realism-engine';

export function generateTCX(track: TrackPoint[], sport: string = 'Running'): string {
  const startTime = track[0].time;
  const totalTimeSeconds = (new Date(track[track.length - 1].time).getTime() - new Date(startTime).getTime()) / 1000;
  const totalDistance = track[track.length - 1].distance;
  
  let trackpointsXML = track.map(tp => `
          <Trackpoint>
            <Time>${tp.time}</Time>
            <Position>
              <LatitudeDegrees>${tp.lat.toFixed(7)}</LatitudeDegrees>
              <LongitudeDegrees>${tp.lng.toFixed(7)}</LongitudeDegrees>
            </Position>
            <DistanceMeters>${tp.distance.toFixed(2)}</DistanceMeters>
            <HeartRateBpm>
              <Value>${tp.hr}</Value>
            </HeartRateBpm>
          </Trackpoint>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
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
