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
  averagePaceMinPerKm: number,
  sport: 'Running' | 'Walking' | 'Biking' = 'Running',
  useRandomStops: boolean = false
): TrackPoint[] {
  if (routePoints.length < 2) return [];

  const track: TrackPoint[] = [];
  let totalDistance = 0;
  let currentTime = startTime.getTime();
  
  // Base speed in meters per second
  const targetSpeedMPS = 1000 / (averagePaceMinPerKm * 60);

  // Setup HR based on sport
  let baseHR = 140;
  let maxJitterHR = 50;
  if (sport === 'Walking') {
    baseHR = 100;
    maxJitterHR = 20;
  } else if (sport === 'Biking') {
    baseHR = 130;
    maxJitterHR = 40;
  }

  track.push({
    lat: routePoints[0].lat,
    lng: routePoints[0].lng,
    time: new Date(currentTime).toISOString(),
    distance: 0,
    hr: baseHR - 20 // Warm up HR
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

    // Random Stops Simulation
    if (useRandomStops && Math.random() < 0.02) { // 2% chance per segment (route point) to stop
      const stopDurationSeconds = Math.floor(Math.random() * 30) + 10; // Stop for 10-40 seconds
      currentTime += stopDurationSeconds * 1000;
      // You could push extra trackpoints here representing the stop, but just incrementing time works for FakeStrava basics.
    }
    
    const hr = Math.round(baseHR + (speedJitter - 1) * maxJitterHR + (Math.random() * 4 - 2));

    track.push({
      lat: p2.lat + (Math.random() - 0.5) * 0.00001,
      lng: p2.lng + (Math.random() - 0.5) * 0.00001,
      time: new Date(currentTime).toISOString(),
      distance: totalDistance,
      hr: hr
    });
  }

  return track;
}
