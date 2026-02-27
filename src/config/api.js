// API keys are loaded from the .env file via EXPO_PUBLIC_ prefix.
// ⚠️  For production, proxy all external API calls through Firebase Cloud Functions
//     instead of shipping live keys in the app bundle.

export const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
export const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';

export const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
export const OPENAI_API_BASE = 'https://api.openai.com/v1';
