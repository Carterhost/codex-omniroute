/**
 * Codex OmniRoute - AI Coding Agent Extension for Antigravity & VS Code
 * License: MIT
 */

const vscode = require('vscode');

const FREE_MODELS_CHAIN = [
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-coder-32b-instruct:free',
  'mistralai/mistral-small-24b-instruct-2501:free'
];

const ALL_MODELS = [
  { id: 'omniroute:free', name: '⚡ OmniRoute (Auto Free Fallback)', provider: 'omniroute' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'NVIDIA Nemotron 3 Ultra (550B Reasoning)', provider: 'nvidia' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free - Reasoning)', provider: 'openrouter' },
  { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek Chat V3 (Free)', provider: 'openrouter' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', provider: 'openrouter' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', provider: 'openrouter' },
  { id: 'google/gemini-2.0-flash-thinking-exp:free', name: 'Gemini 2.0 Flash Thinking (Free)', provider: 'openrouter' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', provider: 'openrouter' },
  { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'openrouter' },
  { id: 'custom', name: 'Custom OpenAI-Compatible Endpoint', provider: 'custom' }
];

class CodexOmniRouteViewProvider {
  constructor(extensionUri, context) {
    this._extensionUri = extensionUri;
    this._context = context;
    this._view = undefined;
    this._abortController = null;
  }

  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'init': {
          this._syncSettingsToWebview();
          break;
        }
        case 'sendMessage': {
          await this._handleSendMessage(data);
          break;
        }
        case 'abort': {
          if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
          }
          break;
        }
        case 'insertAtCursor': {
          this._insertTextAtCursor(data.text);
          break;
        }
        case 'replaceSelection': {
          this._replaceActiveSelection(data.text);
          break;
        }
        case 'saveSettings': {
          await this._saveSettings(data.settings);
          break;
        }
        case 'requestActiveContext': {
          this._sendActiveContext();
          break;
        }
      }
    });
  }

  _syncSettingsToWebview() {
    const config = vscode.workspace.getConfiguration('codexOmniRoute');
    this._postMessage({
      type: 'syncSettings',
      models: ALL_MODELS,
      settings: {
        openRouterApiKey: config.get('openRouterApiKey') || '',
        nvidiaApiKey: config.get('nvidiaApiKey') || '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',
        customEndpointUrl: config.get('customEndpointUrl') || '',
        customApiKey: config.get('customApiKey') || '',
        selectedModel: config.get('selectedModel') || 'nvidia/nemotron-3-ultra-550b-a55b',
        enableThinking: config.get('enableThinking', true),
        temperature: config.get('temperature', 0.7)
      }
    });
  }

  async _saveSettings(settings) {
    const config = vscode.workspace.getConfiguration('codexOmniRoute');
    if (settings.openRouterApiKey !== undefined) await config.update('openRouterApiKey', settings.openRouterApiKey, vscode.ConfigurationTarget.Global);
    if (settings.nvidiaApiKey !== undefined) await config.update('nvidiaApiKey', settings.nvidiaApiKey, vscode.ConfigurationTarget.Global);
    if (settings.customEndpointUrl !== undefined) await config.update('customEndpointUrl', settings.customEndpointUrl, vscode.ConfigurationTarget.Global);
    if (settings.customApiKey !== undefined) await config.update('customApiKey', settings.customApiKey, vscode.ConfigurationTarget.Global);
    if (settings.selectedModel !== undefined) await config.update('selectedModel', settings.selectedModel, vscode.ConfigurationTarget.Global);
    if (settings.enableThinking !== undefined) await config.update('enableThinking', settings.enableThinking, vscode.ConfigurationTarget.Global);
    if (settings.temperature !== undefined) await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
    this._postMessage({ type: 'settingsSaved' });
  }

  _sendActiveContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._postMessage({ type: 'activeContext', hasContext: false });
      return;
    }
    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);
    this._postMessage({
      type: 'activeContext',
      hasContext: true,
      fileName: document.fileName.split(/[\\/]/).pop(),
      language: document.languageId,
      selectedText: selectedText,
      fullText: document.getText()
    });
  }

  _insertTextAtCursor(text) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, text);
      });
    }
  }

  _replaceActiveSelection(text) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, text);
      });
    }
  }

  async _handleSendMessage(data) {
    const { messages, model, settings } = data;
    this._abortController = new AbortController();

    const config = vscode.workspace.getConfiguration('codexOmniRoute');
    const openRouterApiKey = settings?.openRouterApiKey || config.get('openRouterApiKey') || '';
    const nvidiaApiKey = settings?.nvidiaApiKey || config.get('nvidiaApiKey') || '';
    const customEndpointUrl = settings?.customEndpointUrl || config.get('customEndpointUrl') || '';
    const customApiKey = settings?.customApiKey || config.get('customApiKey') || '';
    const temperature = Number(settings?.temperature ?? config.get('temperature', 0.7));
    const enableThinking = Boolean(settings?.enableThinking ?? config.get('enableThinking', true));

    // Handle OmniRoute Auto Free Fallback chain
    if (model === 'omniroute:free') {
      let lastError = null;
      for (const fallbackModel of FREE_MODELS_CHAIN) {
        this._postMessage({
          type: 'status',
          text: `⚡ OmniRoute: Routing to ${fallbackModel}...`
        });
        try {
          await this._streamFromOpenRouter(messages, fallbackModel, openRouterApiKey, temperature, enableThinking);
          return;
        } catch (err) {
          lastError = err;
          this._postMessage({
            type: 'status',
            text: `⚠️ ${fallbackModel} unavailable/rate-limited (${err.message}). Swapping to next model...`
          });
        }
      }
      this._postMessage({
        type: 'error',
        error: `All free models in the OmniRoute fallback chain failed: ${lastError?.message || 'Rate limit / quota exceeded'}. Please add an OpenRouter API key in settings.`
      });
      return;
    }

    // Direct model calls
    try {
      if (model.startsWith('nvidia/')) {
        await this._streamFromNvidia(messages, model, nvidiaApiKey, temperature, enableThinking);
      } else if (model === 'custom') {
        await this._streamFromCustom(messages, customEndpointUrl, customApiKey, temperature);
      } else {
        await this._streamFromOpenRouter(messages, model, openRouterApiKey, temperature, enableThinking);
      }
    } catch (err) {
      if (this._abortController?.signal?.aborted) {
        this._postMessage({ type: 'streamDone', interrupted: true });
      } else {
        this._postMessage({ type: 'error', error: err.message });
      }
    } finally {
      this._abortController = null;
    }
  }

  async _streamFromNvidia(messages, model, apiKey, temperature, enableThinking) {
    if (!apiKey) {
      throw new Error('NVIDIA API Key is missing. Please add it in settings.');
    }
    const payload = {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: 16384,
      chat_template_kwargs: { enable_thinking: enableThinking },
      stream: true
    };

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Codex-OmniRoute-VSCode/1.0'
      },
      body: JSON.stringify(payload),
      signal: this._abortController?.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NVIDIA HTTP ${res.status}: ${errText}`);
    }

    await this._readSseStream(res, 'nvidia');
  }

  async _streamFromOpenRouter(messages, model, apiKey, temperature, enableThinking) {
    const payload = {
      model: model,
      messages: messages,
      temperature: temperature,
      stream: true
    };

    const headers = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/omniroute/codex-omniroute',
      'X-Title': 'Codex OmniRoute'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: this._abortController?.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    await this._readSseStream(res, 'openrouter');
  }

  async _streamFromCustom(messages, endpointUrl, apiKey, temperature) {
    if (!endpointUrl) {
      throw new Error('Custom endpoint URL is required.');
    }
    const cleanUrl = endpointUrl.replace(/\/+$/, '');
    const fullUrl = cleanUrl.endsWith('/chat/completions') ? cleanUrl : `${cleanUrl}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        messages,
        temperature,
        stream: true
      }),
      signal: this._abortController?.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Custom Endpoint HTTP ${res.status}: ${errText}`);
    }

    await this._readSseStream(res, 'custom');
  }

  async _readSseStream(response, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          this._postMessage({ type: 'streamDone' });
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta || {};
          const reasoning = delta.reasoning_content || delta.reasoning || null;
          const content = delta.content || null;

          if (reasoning || content) {
            this._postMessage({
              type: 'streamChunk',
              reasoning: reasoning,
              content: content
            });
          }
        } catch (_) {
          // Ignore incomplete JSON chunks
        }
      }
    }
    this._postMessage({ type: 'streamDone' });
  }

  _postMessage(msg) {
    if (this._view) {
      this._view.webview.postMessage(msg);
    }
  }

    _getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codex OmniRoute</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --input-bg: var(--vscode-input-background, #252526);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --card-bg: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
      --code-bg: var(--vscode-textCodeBlock-background, #161616);
      --border: var(--vscode-widget-border, #333333);
      --accent: #10a37f;
      --reasoning-fg: #9aa0a6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto);
      font-size: var(--vscode-font-size, 13px);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg);
    }
    .brand-tag {
      background: rgba(16, 163, 127, 0.2);
      color: var(--accent);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
    }
    .header-actions {
      display: flex;
      gap: 4px;
    }
    .icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--fg);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover { background: var(--input-bg); border-color: var(--input-border); }
    .model-selector-row {
      display: flex;
      gap: 6px;
    }
    select, input, textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      width: 100%;
      outline: none;
    }
    select:focus, input:focus, textarea:focus { border-color: var(--button-bg); }
    
    /* Stats & Access Indicators (Codex Style) */
    .codex-stats-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      border: 1px solid var(--border);
    }
    .stat-badge {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #888;
      display: inline-block;
    }
    .indicator-dot.active { background-color: var(--accent); }
    .indicator-dot.warning { background-color: #f0a020; }
    .indicator-dot.inactive { background-color: #f44336; }

    /* Settings drawer */
    #settings-drawer {
      display: none;
      padding: 10px;
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      flex-direction: column;
      gap: 8px;
    }
    #settings-drawer.open { display: flex; }
    .setting-item { display: flex; flex-direction: column; gap: 3px; }
    .setting-item label { font-size: 11px; opacity: 0.8; }

    /* Chat Messages */
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .msg {
      display: flex;
      flex-direction: column;
      gap: 6px;
      line-height: 1.5;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--button-bg);
      color: var(--button-fg);
      padding: 8px 12px;
      border-radius: 10px 10px 2px 10px;
      max-width: 90%;
      white-space: pre-wrap;
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--card-bg);
      padding: 10px 12px;
      border-radius: 10px 10px 10px 2px;
      max-width: 98%;
      width: 100%;
      border: 1px solid var(--border);
    }
    .status-badge {
      font-size: 11px;
      color: var(--accent);
      font-style: italic;
      padding: 2px 4px;
    }

    /* Thinking block */
    details.thinking-box {
      margin-bottom: 8px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      padding: 6px 8px;
      background: rgba(0, 0, 0, 0.15);
    }
    details.thinking-box summary {
      cursor: pointer;
      font-size: 11px;
      color: var(--reasoning-fg);
      font-weight: 600;
      user-select: none;
    }
    .thinking-content {
      margin-top: 6px;
      color: var(--reasoning-fg);
      font-size: 11.5px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      line-height: 1.4;
      max-height: 200px;
      overflow-y: auto;
    }

    .code-container {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin: 8px 0;
      overflow: hidden;
    }
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      opacity: 0.8;
    }
    .code-actions { display: flex; gap: 4px; }
    .code-actions button {
      background: transparent;
      border: 1px solid var(--input-border);
      color: var(--fg);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10.5px;
    }
    .code-actions button:hover { background: var(--button-bg); color: var(--button-fg); }
    pre {
      padding: 10px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }

    /* Composer */
    footer {
      border-top: 1px solid var(--border);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--bg);
    }
    .context-bar {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .pill {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--fg);
    }
    .pill:hover { border-color: var(--button-bg); }
    .pill.active { background: rgba(16, 163, 127, 0.2); border-color: var(--accent); color: var(--accent); }
    
    .input-row {
      display: flex;
      gap: 6px;
      position: relative;
    }
    textarea#user-input {
      resize: none;
      height: 64px;
      font-family: inherit;
      padding-right: 40px;
    }
    #send-btn {
      position: absolute;
      right: 8px;
      bottom: 8px;
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      border-radius: 4px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #send-btn:hover { opacity: 0.9; }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    
    /* Helper styling */
    .quick-prompts-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin-top: 4px;
    }
    .quick-prompt-btn {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--fg);
      padding: 4px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .quick-prompt-btn:hover {
      border-color: var(--button-bg);
    }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div class="brand">
        <span>Codex OmniRoute</span>
        <span class="brand-tag">Active</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="new-chat-btn" title="New Session">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1V15M1 8H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="icon-btn" id="toggle-settings-btn" title="Settings">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.12 1H6.88L6.42 3.12C5.92 3.32 5.46 3.6 5.04 3.96L3 3L1.88 4.94L3.48 6.42C3.44 6.67 3.42 6.94 3.42 7.21C3.42 7.48 3.44 7.75 3.48 8L1.88 9.48L3 11.42L5.04 10.46C5.46 10.82 5.92 11.1 6.42 11.3L6.88 13.42H9.12L9.58 11.3C10.08 11.1 10.54 10.82 10.96 10.46L13 11.42L14.12 9.48L12.52 8C12.56 7.75 12.58 7.48 12.58 7.21C12.58 6.94 12.56 6.67 12.52 6.42L14.12 4.94L13 3L10.96 3.96C10.54 3.6 10.08 3.32 9.58 3.12L9.12 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="8" cy="7.21" r="2" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="model-selector-row">
      <select id="model-select"></select>
    </div>
    <div class="codex-stats-row">
      <div class="stat-badge">
        <span class="indicator-dot active" id="connection-indicator"></span>
        <span id="connection-label">NVIDIA Verified</span>
      </div>
      <div class="stat-badge">
        <span>Tokens: </span>
        <span id="token-counter" style="font-weight:600;">0</span>
      </div>
    </div>
  </header>

  <div id="settings-drawer">
    <div class="setting-item">
      <label>NVIDIA NIM API Key</label>
      <input type="password" id="nvidia-key" placeholder="nvapi-..." />
    </div>
    <div class="setting-item">
      <label>OpenRouter API Key (Optional)</label>
      <input type="password" id="openrouter-key" placeholder="sk-or-..." />
    </div>
    <div class="setting-item">
      <label>Custom Endpoint URL</label>
      <input type="text" id="custom-url" placeholder="http://localhost:11434/v1" />
    </div>
    <div class="setting-item">
      <label>Custom API Key</label>
      <input type="password" id="custom-key" placeholder="Key (if needed)" />
    </div>
    <button id="save-settings-btn" style="background: var(--button-bg); color: var(--button-fg); border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">Save Config</button>
  </div>

  <div id="chat-container">
    <div class="msg assistant">
      Welcome! Direct NVIDIA integration is online. Your queries route to the high-performance Nemotron-3-Ultra (550B) model natively.
    </div>
  </div>

  <footer>
    <div class="context-bar">
      <div class="pill" id="add-selection-pill" title="Attach highlighted editor text">
        <span>+ Selection</span>
      </div>
      <div class="pill" id="add-file-pill" title="Attach active document text">
        <span>+ Active File</span>
      </div>
    </div>
    <div class="input-row">
      <textarea id="user-input" placeholder="Ask Codex OmniRoute..."></textarea>
      <button id="send-btn">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L15 8L1 15V9L11 8L1 7V1" fill="currentColor"/>
        </svg>
      </button>
    </div>
    <div class="quick-prompts-container">
      <button class="quick-prompt-btn" id="quick-explain">Explain Selection</button>
      <button class="quick-prompt-btn" id="quick-refactor">Refactor</button>
      <button class="quick-prompt-btn" id="quick-bugs">Find Bugs</button>
      <button class="quick-prompt-btn" id="quick-tests">Unit Tests</button>
    </div>
  </footer>

  <script>
    const vscode = acquireVsCodeApi();
    let totalTokensUsed = 0;

    const modelSelect = document.getElementById('model-select');
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
    const settingsDrawer = document.getElementById('settings-drawer');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    const openRouterInput = document.getElementById('openrouter-key');
    const nvidiaInput = document.getElementById('nvidia-key');
    const customUrlInput = document.getElementById('custom-url');
    const customKeyInput = document.getElementById('custom-key');
    const tokenCounter = document.getElementById('token-counter');
    const connectionIndicator = document.getElementById('connection-indicator');
    const connectionLabel = document.getElementById('connection-label');

    const addSelectionPill = document.getElementById('add-selection-pill');
    const addFilePill = document.getElementById('add-file-pill');

    let chatHistory = [];
    let currentAssistantMsgEl = null;
    let currentReasoningContent = '';
    let currentResponseContent = '';
    let isGenerating = false;
    let attachedContext = '';

    vscode.postMessage({ type: 'init' });

    toggleSettingsBtn.addEventListener('click', () => {
      settingsDrawer.classList.toggle('open');
    });

    saveSettingsBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'saveSettings',
        settings: {
          openRouterApiKey: openRouterInput.value.trim(),
          nvidiaApiKey: nvidiaInput.value.trim(),
          customEndpointUrl: customUrlInput.value.trim(),
          customApiKey: customKeyInput.value.trim(),
          selectedModel: modelSelect.value
        }
      });
    });

    modelSelect.addEventListener('change', () => {
      const isNvidia = modelSelect.value.startsWith('nvidia/');
      if (isNvidia) {
        connectionIndicator.className = 'indicator-dot active';
        connectionLabel.textContent = 'NVIDIA Connected';
      } else if (modelSelect.value === 'custom') {
        connectionIndicator.className = 'indicator-dot warning';
        connectionLabel.textContent = 'Custom Endpoint';
      } else {
        connectionIndicator.className = 'indicator-dot active';
        connectionLabel.textContent = 'OpenRouter Connected';
      }
      vscode.postMessage({
        type: 'saveSettings',
        settings: { selectedModel: modelSelect.value }
      });
    });

    newChatBtn.addEventListener('click', () => {
      chatHistory = [];
      chatContainer.innerHTML = '<div class="msg assistant">Welcome! Direct NVIDIA integration is online. Your queries route to the high-performance Nemotron-3-Ultra (550B) model natively.</div>';
    });

    addSelectionPill.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestActiveContext' });
    });
    addFilePill.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestActiveContext' });
    });

    document.getElementById('quick-explain').addEventListener('click', () => {
      userInput.value = "Explain this code and how it works:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });
    document.getElementById('quick-refactor').addEventListener('click', () => {
      userInput.value = "Refactor and optimize this code for readability and performance:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });
    document.getElementById('quick-bugs').addEventListener('click', () => {
      userInput.value = "Analyze this code for bugs, edge cases, and safety issues:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });
    document.getElementById('quick-tests').addEventListener('click', () => {
      userInput.value = "Write comprehensive unit tests for this block:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });

    function updateTokens(text) {
      if (!text) return;
      // Approx word-to-token count
      const clean = text.trim();
      const tokens = Math.ceil(clean.split(/\s+/).length * 1.3);
      totalTokensUsed += tokens;
      tokenCounter.textContent = totalTokensUsed;
    }

    sendBtn.addEventListener('click', sendUserMessage);
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
      }
    });

    function sendUserMessage() {
      const text = userInput.value.trim();
      if (!text || isGenerating) return;

      let prompt = text;
      if (attachedContext) {
        prompt = `Context:\n\`\`\`\n${attachedContext}\n\`\`\`\n\nUser Question: ${text}`;
      }

      // Add to UI
      const userMsgEl = document.createElement('div');
      userMsgEl.className = 'msg user';
      userMsgEl.textContent = text;
      chatContainer.appendChild(userMsgEl);

      chatHistory.push({ role: 'user', content: prompt });
      userInput.value = '';
      attachedContext = '';
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));

      isGenerating = true;
      sendBtn.disabled = true;

      // Create assistant container
      currentAssistantMsgEl = document.createElement('div');
      currentAssistantMsgEl.className = 'msg assistant';
      currentAssistantMsgEl.innerHTML = '<span class="status-badge">Connecting to AI engine...</span>';
      chatContainer.appendChild(currentAssistantMsgEl);
      chatContainer.scrollTop = chatContainer.scrollHeight;

      currentReasoningContent = '';
      currentResponseContent = '';

      vscode.postMessage({
        type: 'sendMessage',
        model: modelSelect.value,
        messages: chatHistory,
        settings: {
          temperature: 0.7,
          enableThinking: true
        }
      });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'syncSettings': {
          modelSelect.innerHTML = '';
          message.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            opt.selected = m.id === message.settings.selectedModel;
            modelSelect.appendChild(opt);
          });
          openRouterInput.value = message.settings.openRouterApiKey || '';
          nvidiaInput.value = message.settings.nvidiaApiKey || '';
          customUrlInput.value = message.settings.customEndpointUrl || '';
          customKeyInput.value = message.settings.customApiKey || '';
          
          const isNvidia = message.settings.selectedModel.startsWith('nvidia/');
          if (isNvidia) {
            connectionIndicator.className = 'indicator-dot active';
            connectionLabel.textContent = 'NVIDIA Connected';
          } else if (message.settings.selectedModel === 'custom') {
            connectionIndicator.className = 'indicator-dot warning';
            connectionLabel.textContent = 'Custom Endpoint';
          } else {
            connectionIndicator.className = 'indicator-dot active';
            connectionLabel.textContent = 'OpenRouter Connected';
          }
          break;
        }

        case 'activeContext': {
          attachedContext = message.text;
          document.getElementById('add-selection-pill').classList.add('active');
          document.getElementById('add-file-pill').classList.add('active');
          break;
        }

        case 'streamChunk': {
          if (currentAssistantMsgEl.querySelector('.status-badge')) {
            currentAssistantMsgEl.innerHTML = '';
          }

          if (message.reasoning) {
            currentReasoningContent += message.reasoning;
            updateTokens(message.reasoning);
            let thinkingBox = currentAssistantMsgEl.querySelector('details.thinking-box');
            if (!thinkingBox) {
              thinkingBox = document.createElement('details');
              thinkingBox.className = 'thinking-box';
              thinkingBox.open = true;
              thinkingBox.innerHTML = '<summary>Thinking Process</summary><div class="thinking-content"></div>';
              currentAssistantMsgEl.prepend(thinkingBox);
            }
            thinkingBox.querySelector('.thinking-content').textContent = currentReasoningContent;
          }

          if (message.content) {
            currentResponseContent += message.content;
            updateTokens(message.content);
            let responseBody = currentAssistantMsgEl.querySelector('.response-body');
            if (!responseBody) {
              responseBody = document.createElement('div');
              responseBody.className = 'response-body';
              currentAssistantMsgEl.appendChild(responseBody);
            }
            responseBody.innerHTML = formatMarkdown(currentResponseContent);
          }

          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        }

        case 'streamDone': {
          isGenerating = false;
          sendBtn.disabled = false;
          chatHistory.push({ role: 'assistant', content: currentResponseContent });
          break;
        }
      }
    });

    function formatMarkdown(text) {
      if (!text) return '';
      // Basic renderer for codeblocks with insert buttons
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const parts = html.split(/\`\`\`/);
      for (let i = 1; i < parts.length; i += 2) {
        const part = parts[i];
        const lines = part.split('\n');
        const lang = lines[0].trim() || 'code';
        const actualCode = lines.slice(1).join('\n');
        parts[i] = `<div class="code-container">
          <div class="code-header">
            <span>${lang}</span>
            <div class="code-actions">
              <button onclick="insertText(\`​${btoa(unescape(encodeURIComponent(actualCode)))}​\`)">Insert at Cursor</button>
            </div>
          </div>
          <pre><code>${actualCode}</code></pre>
        </div>`;
      }
      
      let rendered = parts.join('');
      return rendered.replace(/\n/g, '<br/>');
    }

    window.insertText = function(base64Payload) {
      const clean = base64Payload.replace(/\u200B/g, '');
      const decoded = decodeURIComponent(escape(atob(clean)));
      vscode.postMessage({
        type: 'insertAtCursor',
        text: decoded
      });
    };
  </script>
</body>
</html>`;
  }

}

function activate(context) {
  const provider = new CodexOmniRouteViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('codexOmniRoute.chatView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.openSidebar', () => {
      vscode.commands.executeCommand('codexOmniRoute.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.newChat', () => {
      provider._view?.webview.postMessage({ type: 'init' });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.explainSelection', () => {
      vscode.commands.executeCommand('codexOmniRoute.chatView.focus');
      provider._sendActiveContext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.refactorSelection', () => {
      vscode.commands.executeCommand('codexOmniRoute.chatView.focus');
      provider._sendActiveContext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.findBugs', () => {
      vscode.commands.executeCommand('codexOmniRoute.chatView.focus');
      provider._sendActiveContext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codexOmniRoute.generateTests', () => {
      vscode.commands.executeCommand('codexOmniRoute.chatView.focus');
      provider._sendActiveContext();
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

