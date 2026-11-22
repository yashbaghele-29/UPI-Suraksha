import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildFallbackAnalysis,
  runRuleEngine,
  scoreToVerdict,
} from './src/engine/rules.ts';
import type { AnalysisResult, Language } from './src/types/analysis.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

interface LlmAnalysisJson {
  risk_score: number;
  verdict: 'Safe' | 'Suspicious' | 'High Risk';
  scam_type: string;
  reasons: string[];
  explanation: string;
  action_steps: string[];
}

function getLanguageInstruction(language: Language): string {
  if (language === 'hi') {
    return 'Hindi written strictly in Devanagari script (हिन्दी). Use very simple everyday words that a college student or parent can understand easily.';
  }
  if (language === 'mr') {
    return 'Marathi written strictly in Devanagari script (मराठी). Use very simple everyday words that a college student or parent can understand easily.';
  }
  return 'English. Use very simple everyday words that a non-technical person can understand easily.';
}

function getFallbackNotice(language: Language, reason: 'no_key' | 'error'): string {
  if (language === 'hi') {
    return reason === 'no_key'
      ? 'AI सेवा कुंजी सेट नहीं है, इसलिए यह परिणाम नियम इंजन (Rule Engine) के आधार पर दिखाया जा रहा है।'
      : 'AI विश्लेषण अभी उपलब्ध नहीं हो सका, इसलिए सुरक्षित नियम इंजन (Rule Engine) से परिणाम दिखाया गया है।';
  }
  if (language === 'mr') {
    return reason === 'no_key'
      ? 'AI की उपलब्ध नसल्यामुळे हा निकाल सुरक्षित नियम इंजिनवर (Rule Engine) आधारित दाखवला आहे.'
      : 'AI विश्लेषण सध्या उपलब्ध न झाल्यामुळे नियम इंजिनद्वारे (Rule Engine) निकाल दाखवला आहे.';
  }
  return reason === 'no_key'
    ? 'AI context key is not configured; showing deterministic rule-engine analysis.'
    : 'AI service was temporarily unavailable; safely fell back to the deterministic rule engine.';
}

function isValidLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'hi' || value === 'mr';
}

async function analyzeWithGemini(
  message: string,
  language: Language
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const ruleResult = runRuleEngine(message);

  if (!apiKey) {
    return buildFallbackAnalysis(
      message,
      language,
      getFallbackNotice(language, 'no_key')
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const signalSummary =
      ruleResult.triggeredSignals.length > 0
        ? ruleResult.triggeredSignals
            .map((s) => `- [${s.category}] (weight +${s.weight}): matched "${s.matchedText}"`)
            .join('\n')
        : '- No automated red-flag patterns triggered.';

    const dampenerSummary =
      ruleResult.dampenersApplied.length > 0
        ? ruleResult.dampenersApplied.join(' ')
        : 'None';

    const targetLanguage = getLanguageInstruction(language);

    const prompt = `Analyze the following SMS, WhatsApp message, or UPI payment/collect request for Indian digital payment fraud.

Triggered Rule Engine Signals (Rule Score: ${ruleResult.ruleScore}/100):
${signalSummary}
Legitimate Pattern Dampeners: ${dampenerSummary}

Message to analyze:
"""
${message}
"""

Requirements:
1. Evaluate whether this message is Safe, Suspicious, or High Risk.
2. Remember: in Indian UPI, a user NEVER needs to enter a UPI PIN to RECEIVE money, and banks never ask for OTPs, CVVs, or remote-access apps like AnyDesk/TeamViewer.
3. Write "scam_type", "reasons", "explanation", and "action_steps" in: ${targetLanguage}
4. Keep "explanation" to 2-3 clear, simple sentences for a non-technical user.
5. Provide 2-4 short items in "reasons" and 3-4 practical items in "action_steps" (mention 1930 / cybercrime.gov.in if risky).`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are UPI Suraksha, an Indian UPI fraud-awareness analyst. Return strictly valid JSON matching the requested schema. Do not include markdown fences.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            risk_score: {
              type: Type.INTEGER,
              description: 'Fraud risk score from 0 (completely safe) to 100 (certain scam).',
            },
            verdict: {
              type: Type.STRING,
              description: 'Must be one of: Safe, Suspicious, High Risk',
            },
            scam_type: {
              type: Type.STRING,
              description: 'Short label of the scam type in the requested language, or None if safe.',
            },
            reasons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 4 concise bullet reasons in the requested language.',
            },
            explanation: {
              type: Type.STRING,
              description: 'Simple 2 to 3 sentence explanation in the requested language.',
            },
            action_steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2 to 4 clear action steps in the requested language.',
            },
          },
          required: [
            'risk_score',
            'verdict',
            'scam_type',
            'reasons',
            'explanation',
            'action_steps',
          ],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Empty response from Gemini model');
    }

    const parsed = JSON.parse(rawText) as LlmAnalysisJson;
    const llmScore = Math.min(100, Math.max(0, Math.round(Number(parsed.risk_score) || 0)));

    // Step 3: Weighted blend (40% deterministic rules + 60% AI contextual analysis)
    let finalScore = Math.round(ruleResult.ruleScore * 0.4 + llmScore * 0.6);

    // Safety guardrail: high-severity rule signals (PIN-to-receive or AnyDesk/APK) must not be understated
    const hasCriticalSignal = ruleResult.triggeredSignals.some(
      (s) => s.id === 'collect_pin_trick' || s.id === 'remote_app'
    );
    if (hasCriticalSignal) {
      finalScore = Math.max(finalScore, Math.round(ruleResult.ruleScore * 0.85), 70);
    }

    // Legitimate alert guardrail: if clean bank alert dampener fired and LLM also sees low risk
    if (ruleResult.dampenersApplied.length > 0 && ruleResult.triggeredSignals.length === 0 && llmScore < 35) {
      finalScore = Math.min(finalScore, 20);
    }

    finalScore = Math.min(100, Math.max(0, finalScore));
    const finalVerdict = scoreToVerdict(finalScore);

    return {
      riskScore: finalScore,
      verdict: finalVerdict,
      scamType: parsed.scam_type?.trim() || ruleResult.suggestedScamType,
      reasons: Array.isArray(parsed.reasons) && parsed.reasons.length > 0
        ? parsed.reasons.slice(0, 5)
        : ruleResult.triggeredSignals.map((s) => s.reason),
      explanation: parsed.explanation?.trim() || '',
      actionSteps:
        Array.isArray(parsed.action_steps) && parsed.action_steps.length > 0
          ? parsed.action_steps.slice(0, 5)
          : buildFallbackAnalysis(message, language).actionSteps,
      ruleScore: ruleResult.ruleScore,
      llmScore,
      triggeredSignals: ruleResult.triggeredSignals,
      fallbackMode: false,
      language,
    };
  } catch (err) {
    console.error('Gemini analysis fallback triggered:', err instanceof Error ? err.message : 'Unknown error');
    return buildFallbackAnalysis(
      message,
      language,
      getFallbackNotice(language, 'error')
    );
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/analyze', async (req, res) => {
    const body = req.body as { message?: unknown; language?: unknown } | undefined;
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const language: Language = isValidLanguage(body?.language) ? body.language : 'en';

    if (!message) {
      res.status(400).json({ error: 'Please paste a message to analyze.' });
      return;
    }

    if (message.length > 4000) {
      res.status(400).json({ error: 'Message is too long. Please keep it under 4,000 characters.' });
      return;
    }

    const result = await analyzeWithGemini(message, language);
    res.json(result);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UPI Suraksha server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
