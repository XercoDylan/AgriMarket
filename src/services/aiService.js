import { OPENAI_API_KEY, OPENAI_API_BASE } from '../config/api';

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

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error?.message || 'AI plan generation failed. Check your OpenAI API key.');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
