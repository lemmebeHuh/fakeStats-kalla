export async function fetchOSRMRoute(waypoints: {lat: number, lng: number}[], profile: 'driving' | 'walking' | 'cycling' = 'walking') {
  if (waypoints.length < 2) return null;
  const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?geometries=geojson&overview=full`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      // GeoJSON returns [lng, lat]
      return data.routes[0].geometry.coordinates.map((coord: number[]) => ({
        lat: coord[1],
        lng: coord[0]
      }));
    }
  } catch (error) {
    console.error("OSRM Error:", error);
  }
  return null;
}
