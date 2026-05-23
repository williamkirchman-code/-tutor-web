// api/chat.js  — Vercel Serverless Function
// Usa Groq API con LLaMA 3 (gratis hasta 14,400 req/día)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { history = [], problema } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada en Vercel' });
  if (!problema) return res.status(400).json({ error: 'Falta el problema actual' });

  // ── System prompt ─────────────────────────────────────────────
  const systemPrompt = `Eres un tutor universitario experto en matemáticas y física. Tu rol es guiar al estudiante en la resolución de problemas usando el método socrático: haces preguntas, das pistas, y solo muestras la solución completa cuando el estudiante lo pida explícitamente.

PROBLEMA ACTUAL:
Materia: ${problema.materia}
Tema: ${problema.tema} › ${problema.subtema}
Dificultad: ${problema.dificultad}
Enunciado:
${problema.enunciado}

REGLAS DE FORMATO — MUY IMPORTANTE:
1. Usa SIEMPRE notación LaTeX para toda expresión matemática:
   - Inline: $expresión$ (ej: $f'(x) = 2x$, $\\int_0^1 x^2\\,dx$)
   - Display (ecuaciones importantes en su propia línea): $$expresión$$ 
2. Escribe fracciones como $\\frac{a}{b}$, raíces como $\\sqrt{x}$, integrales como $\\int_a^b f(x)\\,dx$
3. Vectores con flecha: $\\vec{v}$, derivadas parciales: $\\frac{\\partial f}{\\partial x}$
4. Nunca uses notación ASCII como x^2 o sin^3(x) — siempre LaTeX
5. Estructura clara: usa saltos de línea generosos, numera los pasos

PEDAGOGÍA:
- Si el estudiante pide una pista: da UNA sola pista sin resolver
- Si pide paso a paso: guía sin dar la respuesta final
- Si pide solución completa: muéstrala con todos los pasos y justificación
- Si el estudiante comete un error: señala exactamente dónde y por qué
- Sé riguroso pero accesible, como un buen profesor universitario`;

  // ── Build messages para Groq (formato OpenAI) ─────────────────
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  if (messages.filter(m => m.role === 'user').length === 0) {
    return res.status(400).json({ error: 'No hay mensaje del usuario' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.9,
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq error:', err);
      return res.status(500).json({ error: `Groq API error: ${groqRes.status}` });
    }

    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('Groq respuesta vacía:', JSON.stringify(data));
      return res.status(500).json({ error: 'Respuesta vacía de Groq' });
    }

    return res.status(200).json({ reply });

  } catch (e) {
    console.error('fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
}
