import { getDistance } from './geo';

export interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  distance: number;
  hr: number;
}

export function generateActivity(
  routePoints: {lat: number, lng: number}[],
  startTime: Date,
  averagePaceMinPerKm: number
): TrackPoint[] {
  if (routePoints.length < 2) return [];

  const track: TrackPoint[] = [];
  let totalDistance = 0;
  let currentTime = startTime.getTime();
  
  // Base speed in meters per second
  const targetSpeedMPS = 1000 / (averagePaceMinPerKm * 60);

  track.push({
    lat: routePoints[0].lat,
    lng: routePoints[0].lng,
    time: new Date(currentTime).toISOString(),
    distance: 0,
    hr: 100
  });

  for (let i = 1; i < routePoints.length; i++) {
    const p1 = routePoints[i - 1];
    const p2 = routePoints[i];
    
    const segmentDist = getDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    totalDistance += segmentDist;
    
    // Add jitter to speed to make it realistic
    const speedJitter = 1 + (Math.random() * 0.1 - 0.05); // +/- 5% speed variation
    const currentSpeed = targetSpeedMPS * speedJitter;
    
    // Avoid division by zero
    if (currentSpeed > 0 && segmentDist > 0) {
      const timeTakenSeconds = segmentDist / currentSpeed;
      currentTime += timeTakenSeconds * 1000;
    }
    
    // Simple HR logic based on speed variation
    const baseHR = 140;
    const hr = Math.round(baseHR + (speedJitter - 1) * 50 + (Math.random() * 4 - 2));

    track.push({
      // Add slight GPS Jitter
      lat: p2.lat + (Math.random() - 0.5) * 0.00001,
      lng: p2.lng + (Math.random() - 0.5) * 0.00001,
      time: new Date(currentTime).toISOString(),
      distance: totalDistance,
      hr: hr
    });
  }

  return track;
}
