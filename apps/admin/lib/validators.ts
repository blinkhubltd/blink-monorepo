export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates that the service center is within the service radius from the coordinates
 * @param serviceCenter - The service center coordinates
 * @param coordinates - The vendor's main coordinates
 * @param serviceRadius - The service radius in meters
 * @returns { isValid: boolean, distance: number, message?: string }
 */
export function validateServiceCenterWithinRadius(
  serviceCenter: { lat: number; lng: number } | null | undefined,
  coordinates: { lat: number; lng: number },
  serviceRadius: number
): { isValid: boolean; distance: number; message?: string } {
  // If no service center is provided, validation passes
  if (!serviceCenter) {
    return { isValid: true, distance: 0 };
  }

  const distance = haversineMeters(
    serviceCenter.lat,
    serviceCenter.lng,
    coordinates.lat,
    coordinates.lng
  );

  const isValid = distance <= serviceRadius;

  return {
    isValid,
    distance,
    message: isValid
      ? undefined
      : `Service center must be within the service radius. Distance: ${Math.round(distance)}m, Radius: ${serviceRadius}m`,
  };
}
