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

Return ONLY valid JSON — no markdown, no code fences, no extra text.

{
  "company": "${company}",
  "role": "${role || ''}",
  "frameworks": ["Framework1", "Framework2"],
  "questions": [
    {
      "question": "...",
      "category": "framework name",
      "type": "behavioral|case|situational|technical",
      "sampleAnswer": "2-4 sentence strong answer. STAR format for behavioral. Key framework/approach for case questions."
    }
  ]
}

Rules:
- frameworks: use ${company}'s REAL evaluation criteria (Amazon→16 Leadership Principles; Google→Googleyness/Leadership/Role Knowledge/Cognitive Ability; Meta→Impact/Move Fast/Be Open/Build Social Value; Microsoft→Growth Mindset/Customer Obsessed/Diverse & Inclusive/One Microsoft; McKinsey/BCG/Bain→Case Interview/Personal Experience Interview/Fit; other companies→4-6 logical competency buckets)
- Spread questions evenly across frameworks
- sampleAnswer: keep to 2-4 sentences max — punchy and specific, not verbose
- Case questions: sampleAnswer = the framework/approach to use (e.g. "Use a market sizing framework: clarify scope, segment the market, estimate each segment, sum up")
- Generate exactly 50 questions specific to ${company}'s culture`;

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
        max_tokens: 8000,
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
