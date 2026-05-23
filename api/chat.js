// api/chat.js  — Vercel Serverless Function
// Usa Google Gemini 2.0 Flash (gratis hasta 1500 req/día)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { history = [], problema } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel' });
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

  // ── Build Gemini messages ─────────────────────────────────────
  // Gemini usa roles "user" y "model"
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  // Si no hay historial, el primer mensaje es el system prompt como contexto
  if (contents.length === 0) {
    return res.status(400).json({ error: 'No hay mensaje del usuario' });
  }

  // Inyectar system prompt en el primer turno de usuario
  const firstUser = contents.find(c => c.role === 'user');
  if (firstUser) {
    firstUser.parts[0].text = `[CONTEXTO DEL TUTOR]\n${systemPrompt}\n\n[MENSAJE DEL ESTUDIANTE]\n${firstUser.parts[0].text}`;
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.9,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ]
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: `Gemini API error: ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('Gemini respuesta vacía:', JSON.stringify(data));
      return res.status(500).json({ error: 'Respuesta vacía de Gemini' });
    }

    return res.status(200).json({ reply });

  } catch (e) {
    console.error('fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
}
