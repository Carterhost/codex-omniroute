# Codex OmniRoute — AI Coding Agent

An open-source Codex-style AI coding agent extension for **Antigravity IDE** and **VS Code**.

## Features

- **OmniRoute Dynamic Fallback (`⚡ OmniRoute (Auto Free)`)**:
  Automatically routes requests across the top free models on OpenRouter (`deepseek-r1:free`, `llama-3.3-70b-instruct:free`, `gemini-2.0-flash-exp:free`, `qwen-2.5-coder-32b:free`, `mistral-small:free`). If any model reaches a rate limit (HTTP 429), it seamlessly swaps to the next free model without interrupting your coding flow.
- **NVIDIA NIM Integration**:
  Built-in support for **NVIDIA Nemotron 3 Ultra (550B)** with real-time reasoning / `<thinking>` token reflection.
- **Thinking / Reasoning Traces**:
  Collapsible step-by-step thinking traces for reasoning models (DeepSeek R1, Nemotron, Gemini Thinking).
- **Editor Context Injection**:
  - `+ Selection`: Send highlighted code to the prompt.
  - `+ File`: Send the active document to the prompt.
  - Quick action buttons: **Explain**, **Refactor**, **Find Bugs**, **Tests**.
- **One-Click Code Actions**:
  - Copy code to clipboard
  - Insert directly at active cursor
  - Replace active editor selection

## Configuration & API Keys

Click the **⚙️** icon in the sidebar header to configure your keys:
- **OpenRouter API Key** (optional, recommended for higher rate limits on free models)
- **NVIDIA NIM API Key** (`nvapi-...`)
- **Custom Endpoint URL** (e.g. `http://localhost:11434/v1` for Ollama/LM Studio)

## GitHub CI/CD

Automated packaging and `.vsix` releases are configured via GitHub Actions in [`.github/workflows/build.yml`](.github/workflows/build.yml).

