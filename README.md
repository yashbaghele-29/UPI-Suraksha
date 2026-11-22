UPI Suraksha — UPI Scam & Fraud Detector

Tagline: Paste any suspicious SMS, WhatsApp message, or UPI collect request to check fraud risk before you pay.
Problem Statement

Digital payments via UPI have made transactions effortless for millions of college students and families across India, but fraudsters increasingly exploit social engineering—fake KYC suspension warnings, "enter UPI PIN to receive cashback" collect tricks, screen-sharing APK traps, and "wrong transfer" return scams. UPI Suraksha helps users verify suspicious messages in seconds with plain-language explanations in English, Hindi (हिन्दी), and Marathi (मराठी).

Features

Hybrid Fraud Detection: Combines a fast deterministic 9-category Rule Engine with contextual AI analysis for accurate 0–100 risk scoring.
Clear Verdict & Risk Gauge: Displays a color-coded gauge (Safe, Suspicious, High Risk), detected scam pattern, and rule vs. AI breakdown.
Multilingual Plain-Language Output: Full explanations, red-flag reasons, and interactive "What should I do now" checklists in English, हिन्दी, and मराठी.
10 Synthetic Sample Cases: One-click sample library covering fake KYC SMS, fake UPI collect requests, lottery/refund baits, AnyDesk screen-share scams, wrong-transfer tricks, and legitimate bank alerts.

Resilient Graceful Fallback: Automatically falls back to the deterministic rule engine if the AI API is unavailable or unconfigured—never crashes.

Zero Data Storage: Messages are analyzed ephemerally in memory and never stored or logged.

How It Works
Text
[User Message + Selected Language (EN / HI / MR)]
                     |
                     v
+--------------------------------------------+
| Step 1: Deterministic Rule Engine          |
| Scans 9 weighted fraud signal categories   |
| + legitimate bank alert dampeners          |
+--------------------------------------------+
                     |
                     v
+--------------------------------------------+
| Step 2: AI Contextual Analysis (Gemini)    |
| Evaluates intent & generates JSON reasons, |
| explanation & checklist in chosen language |
+--------------------------------------------+
                     |
                     v
+--------------------------------------------+
| Step 3: Weighted Blend & Safety Guardrails |
| Final Score = 40% Rule + 60% AI (or 100%   |
| Rule Engine on fallback) -> 0-100 Verdict  |
+--------------------------------------------+
Setup & Run Instructions
Prerequisites: Node.js 22+ and npm.
Install dependencies:
Bash
npm install
Configure environment variables:
Copy .env.example to .env and set GEMINI_API_KEY (never commit .env).
Run in development:
Bash
npm run dev
Open http://localhost:3000.
Build & run for production:
Bash
npm run build
npm start
AI Models & APIs Used
Google Gemini API (@google/genai, gemini-4-hydrogen): Used server-side via /api/analyze with structured JSON schema output for contextual fraud reasoning and localized English, Hindi, and Marathi explanations.
Screenshots
Analyzer & Risk Gauge View: Paste input, language selector, risk meter (0–100), red-flag signals, and interactive action checklist.
Synthetic Sample Library: Filterable list of 10 scam and legitimate alerts for instant testing.
Limitations & Future Work
Current scope: Text-only message inspection; does not automatically intercept live SMS or inspect image screenshots.
Future roadmap:
OCR screenshot scanning for UPI collect-request popups and QR codes
Voice-note / call transcript scam detection
Support for additional regional Indian languages (Tamil, Telugu, Bengali, Gujarati, Kannada)
Disclaimer
All sample messages included in this repository are 100% synthetic and contain no real phone numbers, bank accounts, or personal data. UPI Suraksha is an AI assistant for awareness, not a guarantee. Always verify directly with your bank. Report cyber fraud immediately at 1930 or cybercrime.gov.in.
