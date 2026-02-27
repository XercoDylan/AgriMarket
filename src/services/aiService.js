import { CLAUDE_API_KEY, CLAUDE_API_BASE, CLAUDE_MODEL } from '../config/api';

export async function generateFarmingPlan({ crop, farmAreaHectares, lat, lon, weatherSummary }) {
  const prompt = `You are an expert agricultural advisor for African farming. Generate a practical farming plan for:

Crop: ${crop}
Farm Area: ~${farmAreaHectares.toFixed(2)} hectares
Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°
Current Weather: ${weatherSummary}
Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

Provide a concise plan with these sections:
1. **Timeline** – Week-by-week schedule from soil prep to harvest
2. **Soil Preparation** – What to do before planting
3. **Planting** – Spacing, depth, density
4. **Water & Irrigation** – Requirements and schedule
5. **Fertilizer** – Type, timing, quantities
6. **Pest & Disease Management** – Common threats and prevention
7. **Expected Yield** – Estimated kg per hectare
8. **Total Days to Harvest** – Realistic estimate

Keep advice practical and suited for small-to-medium African farmers. Be specific with numbers.`;

  if (!CLAUDE_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ANTHROPIC_API_KEY in .env.');
  }

  const fallbackModels = [
    CLAUDE_MODEL,
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-6',
  ];
  const modelsToTry = [...new Set(fallbackModels.filter(Boolean))];
  let lastError = null;

  for (const model of modelsToTry) {
    let response;
    try {
      response = await fetch(`${CLAUDE_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.6,
          max_tokens: 1200,
        }),
      });
    } catch (error) {
      throw new Error(`Network error while calling Claude: ${error?.message || 'request failed'}`);
    }

    if (!response.ok) {
      let msg = `Claude API error (${response.status}) on model ${model}.`;
      try {
        const error = await response.json();
        const apiMsg = error?.error?.message;
        if (apiMsg) msg = `${msg} ${apiMsg}`;
      } catch {
        try {
          const raw = await response.text();
          if (raw?.trim()) msg = `${msg} ${raw.slice(0, 300)}`;
        } catch {
          // Ignore response parse failures.
        }
      }

      lastError = msg;
      const shouldTryNext = response.status === 404 && /model/i.test(msg);
      if (shouldTryNext) continue;
      throw new Error(msg);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Claude API returned an invalid JSON response.');
    }

    const text = Array.isArray(data?.content)
      ? data.content
          .filter((part) => part?.type === 'text' && typeof part?.text === 'string')
          .map((part) => part.text)
          .join('\n')
          .trim()
      : '';

    if (!text) {
      throw new Error(`Claude returned an empty response for model ${model}.`);
    }

    return text;
  }

  throw new Error(lastError || 'Claude API failed for all configured models.');
}
