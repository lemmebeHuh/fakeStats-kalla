import { getDistance } from './geo';

export interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  distance: number;
  hr: number;
  elevation?: number;
  cadence?: number;
  power?: number;
}

export async function fetchElevations(points: {lat: number, lng: number}[]): Promise<number[]> {
  try {
    const maxSamples = 100;
    const step = Math.max(1, Math.floor(points.length / maxSamples));
    
    const sampled = points.filter((_, i) => i % step === 0);
    const lats = sampled.map(p => p.lat.toFixed(5)).join(',');
    const lngs = sampled.map(p => p.lng.toFixed(5)).join(',');
    
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
    const data = await res.json();
    
    if (data.elevation) {
      const elevations = data.elevation;
      const result: number[] = [];
      let sampleIdx = 0;
      
      for (let i = 0; i < points.length; i++) {
        if (i % step === 0 && sampleIdx < elevations.length) {
          result.push(elevations[sampleIdx]);
          if (i !== 0) sampleIdx++;
        } else {
          const prevIdx = Math.max(0, sampleIdx - 1);
          const nextIdx = Math.min(elevations.length - 1, sampleIdx);
          const e1 = elevations[prevIdx];
          const e2 = elevations[nextIdx];
          
          const distToPrev = i - (prevIdx * step);
          const ratio = distToPrev / step;
          result.push(e1 + (e2 - e1) * ratio);
        }
      }
      return result;
    }
  } catch (e) {
    console.error("Elevation fetch failed", e);
  }
  return points.map(() => 0); 
}

export type PacingStrategy = 'Flat' | 'Negative Split' | 'Progression';

export async function generateActivity(
  routePoints: {lat: number, lng: number}[],
  startTime: Date,
  averagePaceMinPerKm: number,
  sport: 'Running' | 'Walking' | 'Biking' = 'Running',
  useRandomStops: boolean = false,
  pacingStrategy: PacingStrategy = 'Flat',
  elevationSensitivity: number = 1.0,
  loops: number = 1
): Promise<TrackPoint[]> {
  if (routePoints.length < 2) return [];

  let finalRoutePoints: {lat: number, lng: number}[] = [];
  for (let l = 0; l < loops; l++) {
    const pointsToAdd = (l > 0 && routePoints[0].lat === routePoints[routePoints.length-1].lat && routePoints[0].lng === routePoints[routePoints.length-1].lng) 
      ? routePoints.slice(1) 
      : routePoints;
    finalRoutePoints = finalRoutePoints.concat(pointsToAdd);
  }

  const elevations = await fetchElevations(finalRoutePoints);

  const track: TrackPoint[] = [];
  let totalDistance = 0;
  let currentTime = startTime.getTime();
  
  const targetSpeedMPS = 1000 / (averagePaceMinPerKm * 60);

  let baseHR = sport === 'Biking' ? 120 : (sport === 'Walking' ? 95 : 140);
  let maxJitterHR = sport === 'Biking' ? 30 : (sport === 'Walking' ? 15 : 40);

  track.push({
    lat: finalRoutePoints[0].lat,
    lng: finalRoutePoints[0].lng,
    time: new Date(currentTime).toISOString(),
    distance: 0,
    hr: baseHR - 15,
    elevation: elevations[0],
    cadence: sport === 'Biking' ? 80 : (sport === 'Walking' ? 100 : 160),
    power: sport === 'Biking' ? 100 : 150
  });

  const totalExpectedDist = finalRoutePoints.reduce((acc, p, i) => {
    if (i === 0) return acc;
    return acc + getDistance(finalRoutePoints[i-1].lat, finalRoutePoints[i-1].lng, p.lat, p.lng);
  }, 0);

  for (let i = 1; i < finalRoutePoints.length; i++) {
    const p1 = finalRoutePoints[i - 1];
    const p2 = finalRoutePoints[i];
    
    const segmentDist = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    totalDistance += segmentDist;
    
    const progress = totalDistance / totalExpectedDist;

    let strategyMultiplier = 1.0;
    if (pacingStrategy === 'Negative Split') {
       strategyMultiplier = 0.95 + (progress * 0.1); 
    } else if (pacingStrategy === 'Progression') {
       strategyMultiplier = 0.90 + (progress * 0.2);
    }

    let elevDiff = elevations[i] - elevations[i-1];
    let gradient = (elevDiff / segmentDist) * 100;
    if (isNaN(gradient)) gradient = 0;

    let elevMultiplier = 1.0;
    if (gradient > 0) {
       elevMultiplier = Math.max(0.4, 1 - (gradient * 0.05 * elevationSensitivity));
    } else if (gradient < 0) {
       elevMultiplier = Math.min(1.3, 1 - (gradient * 0.03 * elevationSensitivity));
    }

    const speedJitter = 1 + (Math.random() * 0.04 - 0.02);
    const currentSpeed = targetSpeedMPS * strategyMultiplier * elevMultiplier * speedJitter;
    
    if (currentSpeed > 0 && segmentDist > 0) {
      currentTime += (segmentDist / currentSpeed) * 1000;
    }

    if (useRandomStops && Math.random() < 0.01) { 
      currentTime += (Math.floor(Math.random() * 20) + 10) * 1000;
    }
    
    const effort = currentSpeed / targetSpeedMPS;
    const perceivedEffort = (targetSpeedMPS / currentSpeed) * (gradient > 0 ? 1 + gradient*0.1 : 1);
    
    const hr = Math.round(baseHR * strategyMultiplier + (perceivedEffort - 1) * maxJitterHR + (Math.random() * 4 - 2));
    
    let cadence = 0;
    let power = 0;
    
    if (sport === 'Running') {
      cadence = Math.round(160 + (effort - 1) * 20 + Math.random() * 4); 
      power = Math.round(200 * effort * (gradient > 0 ? 1 + gradient*0.05 : 1) + Math.random() * 10);
    } else if (sport === 'Biking') {
      cadence = Math.round(85 + (effort - 1) * 15 + Math.random() * 5); 
      power = Math.round(150 * effort * (gradient > 0 ? 1 + gradient*0.1 : 1) + Math.random() * 15);
    } else if (sport === 'Walking') {
      cadence = Math.round(110 + (effort - 1) * 10 + Math.random() * 2);
    }

    track.push({
      lat: p2.lat + (Math.random() - 0.5) * 0.00001,
      lng: p2.lng + (Math.random() - 0.5) * 0.00001,
      time: new Date(currentTime).toISOString(),
      distance: totalDistance,
      hr: Math.max(60, Math.min(200, hr)),
      elevation: elevations[i],
      cadence,
      power
    });
  }

  return track;
}
