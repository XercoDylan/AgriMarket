import { CLAUDE_API_KEY, CLAUDE_API_BASE, CLAUDE_MODEL } from '../config/api';

function cleanText(value) {
  if (!value) return '';
  return String(value)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/`+/g, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = safeJsonParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = safeJsonParse(candidate) || safeJsonParse(candidate.replace(/,\s*([}\]])/g, '$1'));
    if (parsed) return parsed;
  }
  return null;
}

function buildFallbackPlan(rawText, { crop, weatherSummary, farmAreaHectares }) {
  const extractedTasks = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[\).]\s+/, '').trim())
    .filter((line) => line.length >= 12 && !/[{}[\]"]/.test(line))
    .slice(0, 10);

  const defaultTasks = [
    `Prepare soil beds for ${crop} and remove weeds before planting.`,
    `Mark row spacing and planting depth suitable for ${crop}.`,
    `Plant high quality seeds or stems at uniform spacing.`,
    `Set a weekly watering schedule based on local rainfall.`,
    `Apply fertilizer in split doses to reduce nutrient loss.`,
    `Scout for pests and disease signs at least twice per week.`,
    `Adjust irrigation and feeding around flowering stage.`,
    `Harvest at proper maturity and sort produce by quality.`,
  ];
  const tasks = extractedTasks.length >= 4 ? extractedTasks : defaultTasks;

  const phaseOrder = ['soil', 'planting', 'water', 'fertilizer', 'protection', 'harvest'];
  const steps = tasks.slice(0, 8).map((task, idx) => {
    const phase = phaseOrder[idx % phaseOrder.length];
    return {
      title: `${phase.charAt(0).toUpperCase() + phase.slice(1)} Step`,
      phase,
      start_day: idx * 7,
      end_day: idx * 7 + 6,
      priority: idx < 2 ? 'high' : idx < 5 ? 'medium' : 'low',
      reason: `This action improves ${crop} output consistency on your farm.`,
      actions: [
        {
          task,
          why: `Helps protect yield and crop quality for ${crop}.`,
          when: idx === 0 ? 'Start immediately' : `Week ${idx + 1}`,
          warning: '',
        },
      ],
    };
  });

  return {
    summary: {
      objective: `Optimize ${crop} production on ${farmAreaHectares.toFixed(2)} ha using weather-aware scheduling.`,
      estimated_harvest_days: 90,
      expected_yield_kg: Math.max(150, Math.round(farmAreaHectares * 3500)),
      risk_level: /storm|heavy rain|heat|dry/i.test(weatherSummary || '') ? 'medium' : 'low',
      key_decision: `Prioritize timing and water management for ${crop}.`,
    },
    alerts: [
      {
        title: 'Weather Watch',
        severity: 'info',
        message: cleanText(weatherSummary || 'Monitor daily weather updates and adjust activities.'),
      },
    ],
    steps,
  };
}

function normalizeStructuredPlan(rawText, context) {
  const parsed = extractJsonObject(rawText);
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    return buildFallbackPlan(rawText, context);
  }

  const steps = parsed.steps
    .map((step, stepIdx) => {
      const actions = Array.isArray(step?.actions)
        ? step.actions
            .map((action) => ({
              task: cleanText(action?.task),
              why: cleanText(action?.why),
              when: cleanText(action?.when),
              warning: cleanText(action?.warning),
            }))
            .filter((a) => a.task)
        : [];
      if (actions.length === 0) return null;
      const phase = cleanText(step?.phase).toLowerCase() || 'planting';
      return {
        title: cleanText(step?.title) || `Step ${stepIdx + 1}`,
        phase,
        start_day: Number.isFinite(Number(step?.start_day)) ? Number(step.start_day) : stepIdx * 7,
        end_day: Number.isFinite(Number(step?.end_day)) ? Number(step.end_day) : stepIdx * 7 + 6,
        priority: ['low', 'medium', 'high'].includes(cleanText(step?.priority).toLowerCase())
          ? cleanText(step?.priority).toLowerCase()
          : 'medium',
        reason: cleanText(step?.reason),
        actions,
      };
    })
    .filter(Boolean);

  if (steps.length === 0) return buildFallbackPlan(rawText, context);

  return {
    summary: {
      objective: cleanText(parsed?.summary?.objective) || `Optimize ${context.crop} output through guided farm actions.`,
      estimated_harvest_days: Number.isFinite(Number(parsed?.summary?.estimated_harvest_days))
        ? Number(parsed.summary.estimated_harvest_days)
        : 90,
      expected_yield_kg: Number.isFinite(Number(parsed?.summary?.expected_yield_kg))
        ? Number(parsed.summary.expected_yield_kg)
        : Math.max(150, Math.round(context.farmAreaHectares * 3500)),
      risk_level: ['low', 'medium', 'high'].includes(cleanText(parsed?.summary?.risk_level).toLowerCase())
        ? cleanText(parsed.summary.risk_level).toLowerCase()
        : 'medium',
      key_decision: cleanText(parsed?.summary?.key_decision) || `Focus on timing, water, and pest prevention for ${context.crop}.`,
    },
    alerts: Array.isArray(parsed?.alerts)
      ? parsed.alerts
          .map((a) => ({
            title: cleanText(a?.title),
            severity: ['info', 'warning', 'critical'].includes(cleanText(a?.severity).toLowerCase())
              ? cleanText(a.severity).toLowerCase()
              : 'info',
            message: cleanText(a?.message),
          }))
          .filter((a) => a.title || a.message)
      : [],
    steps,
  };
}

export async function generateFarmingPlan({ crop, farmAreaHectares, lat, lon, weatherSummary }) {
  const prompt = `You are an expert agricultural advisor for African farming. Generate a practical farming plan for:

Crop: ${crop}
Farm Area: ~${farmAreaHectares.toFixed(2)} hectares
Location: ${lat.toFixed(4)} deg, ${lon.toFixed(4)} deg
Current Weather: ${weatherSummary}
Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

Return ONLY valid JSON (no markdown, no explanation, no code fences) using this exact schema:
{
  "summary": {
    "objective": "string",
    "estimated_harvest_days": number,
    "expected_yield_kg": number,
    "risk_level": "low|medium|high",
    "key_decision": "short string"
  },
  "alerts": [
    { "title": "short string", "severity": "info|warning|critical", "message": "short string" }
  ],
  "steps": [
    {
      "title": "string",
      "phase": "soil|planting|water|fertilizer|protection|harvest",
      "start_day": number,
      "end_day": number,
      "priority": "low|medium|high",
      "reason": "short string",
      "actions": [
        {
          "task": "short actionable sentence",
          "why": "short string",
          "when": "short string",
          "warning": "short string or empty"
        }
      ]
    }
  ]
}

Rules:
- Use clear plain ASCII text only.
- Keep each text field concise and practical.
- Always include at least 6 steps and at least 1 action per step.
- Tailor the plan to small-to-medium African farmers.
- Use weather context and farm area to make practical decisions.`;

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

    const normalized = normalizeStructuredPlan(text, { crop, farmAreaHectares, weatherSummary });
    return JSON.stringify(normalized);
  }

  throw new Error(lastError || 'Claude API failed for all configured models.');
}
