// API keys are loaded from the .env file via EXPO_PUBLIC_ prefix.
// ⚠️  For production, proxy all external API calls through Firebase Cloud Functions
//     instead of shipping live keys in the app bundle.

export const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
export const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';

export const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
export const CLAUDE_API_BASE = 'https://api.anthropic.com/v1';
export const CLAUDE_MODEL = process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
