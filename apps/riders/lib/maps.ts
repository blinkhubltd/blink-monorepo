import { Linking, Platform } from 'react-native';

export type Coordinates = { lat?: number | null; lng?: number | null };

function toQuery(address?: string | null, coords?: Coordinates) {
  if (coords?.lat != null && coords?.lng != null) {
    return `${coords.lat},${coords.lng}`;
  }
  return encodeURIComponent(address || '');
}

export async function openInMaps(options: {
  addressLabel?: string;
  addressText?: string | null;
  coords?: Coordinates;
}) {
  const query = toQuery(options.addressText, options.coords);
  const label = encodeURIComponent(options.addressLabel || 'Destination');

  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

  // iOS supports maps://, Android will fallback to Google Maps via https
  const iosUrl = `maps:0,0?q=${query}(${label})`;
  const androidUrl = `geo:0,0?q=${query}(${label})`;

  const url = Platform.select({ ios: iosUrl, android: androidUrl, default: googleUrl })!;

  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    return Linking.openURL(url);
  }
  return Linking.openURL(googleUrl);
}

