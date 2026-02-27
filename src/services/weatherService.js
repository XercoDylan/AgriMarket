import { WEATHER_API_KEY, WEATHER_API_BASE } from '../config/api';

export async function getWeatherData(lat, lon) {
  const url = `${WEATHER_API_BASE}/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=7&aqi=no`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || 'Failed to fetch weather data');
  }
  return response.json();
}

export function formatWeatherSummary(weather) {
  if (!weather?.current) return 'Weather data unavailable';
  const { temp_c, condition, humidity, wind_kph } = weather.current;
  return `${temp_c}°C, ${condition.text}, Humidity: ${humidity}%, Wind: ${wind_kph} km/h`;
}
