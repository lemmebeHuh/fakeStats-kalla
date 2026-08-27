import { TrackPoint } from './realism-engine';
import { getDistance } from './geo';

export function parseActivityFile(xmlString: string, extension: string): TrackPoint[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const trackpoints: TrackPoint[] = [];

  if (extension === 'tcx') {
    const tps = xmlDoc.getElementsByTagName('Trackpoint');
    let totalDist = 0;
    
    for (let i = 0; i < tps.length; i++) {
      const tp = tps[i];
      const timeNode = tp.getElementsByTagName('Time')[0];
      const latNode = tp.getElementsByTagName('LatitudeDegrees')[0];
      const lngNode = tp.getElementsByTagName('LongitudeDegrees')[0];
      const hrNode = tp.getElementsByTagName('HeartRateBpm')[0];
      const distNode = tp.getElementsByTagName('DistanceMeters')[0];

      if (timeNode && latNode && lngNode) {
        const lat = parseFloat(latNode.textContent || '0');
        const lng = parseFloat(lngNode.textContent || '0');
        
        let distance = distNode ? parseFloat(distNode.textContent || '0') : 0;
        if (!distNode && i > 0) {
          totalDist += getDistance(trackpoints[i-1].lat, trackpoints[i-1].lng, lat, lng);
          distance = totalDist;
        }

        let hr = 120;
        if (hrNode) {
          const valNode = hrNode.getElementsByTagName('Value')[0];
          if (valNode) hr = parseInt(valNode.textContent || '120', 10);
        }

        trackpoints.push({ lat, lng, time: timeNode.textContent || '', distance, hr });
      }
    }
  } else if (extension === 'gpx') {
    const trkpts = xmlDoc.getElementsByTagName('trkpt');
    let totalDist = 0;

    for (let i = 0; i < trkpts.length; i++) {
      const tp = trkpts[i];
      const lat = parseFloat(tp.getAttribute('lat') || '0');
      const lng = parseFloat(tp.getAttribute('lon') || '0');
      const timeNode = tp.getElementsByTagName('time')[0];
      
      let hr = 120;
      const extensions = tp.getElementsByTagName('extensions')[0];
      if (extensions) {
        // Various HR tags in GPX
        const hr1 = extensions.getElementsByTagName('hr')[0];
        const hr2 = extensions.getElementsByTagName('gpxtpx:hr')[0];
        const hrNode = hr1 || hr2;
        if (hrNode) hr = parseInt(hrNode.textContent || '120', 10);
      }

      if (i > 0) {
        totalDist += getDistance(trackpoints[i-1].lat, trackpoints[i-1].lng, lat, lng);
      }

      trackpoints.push({
        lat,
        lng,
        time: timeNode ? timeNode.textContent || '' : new Date().toISOString(),
        distance: totalDist,
        hr
      });
    }
  }

  return trackpoints;
}

export function reverseTrack(track: TrackPoint[]): TrackPoint[] {
  if (track.length === 0) return [];
  
  // Clone and reverse array
  const reversed = [...track].reverse();
  const startTime = new Date(track[0].time).getTime();
  
  const newTrack: TrackPoint[] = [];
  let currentTime = startTime;
  let currentDist = 0;

  newTrack.push({
    ...reversed[0],
    time: new Date(currentTime).toISOString(),
    distance: 0,
  });

  for (let i = 1; i < reversed.length; i++) {
    const prevOrig = reversed[i - 1]; // Originally the next point
    const currOrig = reversed[i];
    
    // Original time taken between these two points
    // Note: since we reversed, the original points are traversing backwards.
    // So time diff is original(i-1).time - original(i).time
    const timeDiff = new Date(prevOrig.time).getTime() - new Date(currOrig.time).getTime();
    currentTime += timeDiff;
    
    const distDiff = getDistance(prevOrig.lat, prevOrig.lng, currOrig.lat, currOrig.lng);
    currentDist += distDiff;

    newTrack.push({
      ...currOrig,
      time: new Date(currentTime).toISOString(),
      distance: currentDist
    });
  }

  return newTrack;
}

export function adjustSpeed(track: TrackPoint[], targetPaceMinPerKm: number): TrackPoint[] {
  if (track.length === 0) return [];

  const targetSpeedMPS = 1000 / (targetPaceMinPerKm * 60);
  const newTrack: TrackPoint[] = [];
  const startTime = new Date(track[0].time).getTime();
  let currentTime = startTime;

  newTrack.push({
    ...track[0],
    time: new Date(currentTime).toISOString()
  });

  for (let i = 1; i < track.length; i++) {
    const prev = track[i - 1];
    const curr = track[i];
    const dist = getDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    
    // Jitter speed +/- 2% for realism, instead of constant exactly
    const speedJitter = 1 + (Math.random() * 0.04 - 0.02);
    const speed = targetSpeedMPS * speedJitter;
    
    if (speed > 0 && dist > 0) {
      currentTime += (dist / speed) * 1000;
    }

    newTrack.push({
      ...curr,
      time: new Date(currentTime).toISOString()
    });
  }

  return newTrack;
}
