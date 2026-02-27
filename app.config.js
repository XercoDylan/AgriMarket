// Dynamic Expo config — reads from .env automatically via Expo CLI.
// Extends static app.json with values that require environment variables.
export default ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    // Optional: set to use Google Maps on iOS instead of the default Apple Maps.
    // Requires enabling "Maps SDK for iOS" in Google Cloud Console.
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
