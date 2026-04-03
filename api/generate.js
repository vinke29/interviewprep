export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company, role } = req.body || {};
  if (!company) {
    return res.status(400).json({ error: 'company is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const roleStr = role ? ` for a ${role} role` : '';

  const prompt = `You are an expert interview coach. Generate exactly 50 interview questions for ${company}${roleStr}.

Return ONLY valid JSON with NO markdown, NO code fences, NO extra text — just the raw JSON object.

Schema:
{
  "company": "${company}",
  "role": "${role || ''}",
  "frameworks": ["Framework1", "Framework2", ...],
  "questions": [
    {
      "question": "...",
      "category": "exact framework name from frameworks array",
      "type": "behavioral|case|situational|technical",
      "sampleAnswer": "150-300 word strong sample answer using appropriate structure (STAR for behavioral, structured framework for case)"
    }
  ]
}

Rules:
- frameworks: use the REAL evaluation frameworks ${company} uses (e.g. Amazon → their 16 Leadership Principles; Google → Googleyness & Being Comfortable with Ambiguity / Leadership / Role-Related Knowledge / General Cognitive Ability; McKinsey/BCG/Bain → Case Interview / Personal Experience Interview / Fit; Meta → Focus on Impact / Move Fast / Be Open / Build Social Value / Live in the Future; Microsoft → Growth Mindset / Customer Obsessed / Diverse & Inclusive / One Microsoft / Making a Difference; for other companies invent 4-6 logical competency buckets)
- Spread questions roughly evenly across all frameworks
- For case questions (consulting firms, or "case" type), sampleAnswer should outline the case approach/framework to use, not a STAR story
- For behavioral, use STAR structure in sampleAnswer
- Generate exactly 50 questions
- Make questions specific to ${company}'s culture and interview style`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'OpenAI error', detail: err });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return res.status(502).json({ error: 'Empty response from OpenAI' });
    }

    // Strip markdown code fences if model added them anyway
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'Failed to parse JSON from OpenAI', raw: cleaned.slice(0, 500) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
