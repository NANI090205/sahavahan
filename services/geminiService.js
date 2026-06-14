const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;

// IMPORTANT: Do not throw at import-time.
// This file can be imported by routes even when Gemini is not used.
// We validate inside askGemini() and fail gracefully per-request.
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

function normalizeModelName(m) {
  return String(m?.name || m?.model || m || "").trim();
}

async function getBestModel(genAIInstance) {
  // Prioritized list: we will try in order, but only use those that exist.
  const preferred = [
    // Prefer 2.x/2.5 models first. Your error indicates 1.5 models may not be supported by this SDK/endpoint.
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ];

  // Try to list models (SDK-supported). Different SDK versions may return shapes slightly differently.
  let models = [];
  try {
    if (typeof genAIInstance.listModels !== "function") {
      // If listModels isn't available, fall back to first preferred.
      return genAIInstance.getGenerativeModel({ model: preferred[0] });
    }

    const listed = await genAIInstance.listModels();
    // Common shapes:
    // - { models: [...] }
    // - [ ... ]
    models = Array.isArray(listed) ? listed : listed?.models || [];
  } catch (e) {
    console.error("Gemini listModels failed, falling back.", e);
  }

  const availableNames = models.map(normalizeModelName).filter(Boolean);
  if (availableNames.length === 0) {
    return genAIInstance.getGenerativeModel({ model: preferred[0] });
  }

  const firstPreferred = preferred.find((p) => availableNames.includes(p));
  if (firstPreferred) {
    return genAIInstance.getGenerativeModel({ model: firstPreferred });
  }

  // Otherwise pick the first available model as a last resort.
  return genAIInstance.getGenerativeModel({ model: availableNames[0] });
}

async function askGemini(prompt) {
  if (!genAI) {
    throw new Error("Gemini unavailable: missing GEMINI_API_KEY");
  }

  const model = await getBestModel(genAI);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Gemini Attempt ${attempt}`);

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      console.error(`Attempt ${attempt} failed`);

      // Retry only on transient service issues
      if (err?.status === 503 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      throw err;
    }
  }
}


module.exports = {
  askGemini,
};


