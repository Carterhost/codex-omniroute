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

    /* Code blocks */
    .code-container {
      position: relative;
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
      padding: 6px 10px;
      cursor: pointer;
      font-weight: 600;
    }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div class="brand">
        <span>Codex OmniRoute</span>
        <span class="brand-tag">v1.0</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="new-chat-btn" title="New Chat">➕</button>
        <button class="icon-btn" id="toggle-settings-btn" title="API Keys & Settings">⚙️</button>
      </div>
    </div>
    <div class="model-selector-row">
      <select id="model-select"></select>
    </div>
  </header>

  <div id="settings-drawer">
    <div class="setting-item">
      <label>OpenRouter API Key (for Free Models)</label>
      <input type="password" id="openrouter-key" placeholder="sk-or-v1-..." />
    </div>
    <div class="setting-item">
      <label>NVIDIA NIM API Key</label>
      <input type="password" id="nvidia-key" placeholder="nvapi-..." />
    </div>
    <div class="setting-item">
      <label>Custom Endpoint URL</label>
      <input type="text" id="custom-url" placeholder="http://localhost:11434/v1" />
    </div>
    <div class="setting-item">
      <label>Custom Endpoint Key</label>
      <input type="password" id="custom-key" placeholder="Optional" />
    </div>
    <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">
      <button class="icon-btn" id="save-settings-btn" style="background:var(--button-bg);color:var(--button-fg);padding:4px 10px;">Save Keys</button>
    </div>
  </div>

  <div id="chat-container">
    <div class="msg assistant" id="welcome-msg">
      <b>👋 Welcome to Codex OmniRoute!</b><br/>
      An open-source Codex-style AI coding agent supporting <b>OpenRouter free models</b>, <b>NVIDIA Nemotron 3 Ultra</b>, and automatic <b>OmniRoute</b> fallback.<br/><br/>
      • Click ⚙️ above to view or update your API keys.<br/>
      • Select <b>⚡ OmniRoute (Auto Free Fallback)</b> to automatically cycle through free models without rate limit hiccups.<br/>
      • Click <b>+ Selection</b> or <b>+ Current File</b> to inject context into your prompt!
    </div>
  </div>

  <footer>
    <div class="context-bar">
      <button class="pill" id="add-selection-pill" title="Attach selected code">+ Selection</button>
      <button class="pill" id="add-file-pill" title="Attach current file">+ File</button>
      <button class="pill" id="quick-explain">Explain</button>
      <button class="pill" id="quick-refactor">Refactor</button>
      <button class="pill" id="quick-bugs">Find Bugs</button>
      <button class="pill" id="quick-tests">Tests</button>
    </div>
    <div class="input-row">
      <textarea id="user-input" placeholder="Ask Codex OmniRoute... (Enter to send, Shift+Enter for newline)"></textarea>
      <button id="send-btn">↑</button>
    </div>
  </footer>

  <script>
    const vscode = acquireVsCodeApi();

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

    const addSelectionPill = document.getElementById('add-selection-pill');
    const addFilePill = document.getElementById('add-file-pill');

    let chatHistory = [];
    let currentAssistantMsgEl = null;
    let currentReasoningContent = '';
    let currentResponseContent = '';
    let isGenerating = false;
    let attachedContext = '';

    // Initialize
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
      vscode.postMessage({
        type: 'saveSettings',
        settings: { selectedModel: modelSelect.value }
      });
    });

    newChatBtn.addEventListener('click', () => {
      chatHistory = [];
      chatContainer.innerHTML = '<div class="msg assistant">Started a new session. How can I help with your code?</div>';
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
      userInput.value = "Analyze this code for bugs, edge cases, and security vulnerabilities:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });
    document.getElementById('quick-tests').addEventListener('click', () => {
      userInput.value = "Generate comprehensive unit tests for this code:";
      vscode.postMessage({ type: 'requestActiveContext' });
    });

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    sendBtn.addEventListener('click', sendMessage);

    function sendMessage() {
      const text = userInput.value.trim();
      if (!text || isGenerating) return;

      let fullPrompt = text;
      if (attachedContext) {
        fullPrompt = attachedContext + "\\n\\n" + text;
        attachedContext = '';
        addSelectionPill.classList.remove('active');
        addFilePill.classList.remove('active');
      }

      appendUserMessage(text);
      userInput.value = '';

      chatHistory.push({ role: 'user', content: fullPrompt });

      startAssistantMessage();

      vscode.postMessage({
        type: 'sendMessage',
        messages: chatHistory,
        model: modelSelect.value,
        settings: {
          openRouterApiKey: openRouterInput.value.trim(),
          nvidiaApiKey: nvidiaInput.value.trim(),
          customEndpointUrl: customUrlInput.value.trim(),
          customApiKey: customKeyInput.value.trim()
        }
      });
    }

    function appendUserMessage(text) {
      const el = document.createElement('div');
      el.className = 'msg user';
      el.textContent = text;
      chatContainer.appendChild(el);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function startAssistantMessage() {
      isGenerating = true;
      sendBtn.disabled = true;
      currentReasoningContent = '';
      currentResponseContent = '';

      currentAssistantMsgEl = document.createElement('div');
      currentAssistantMsgEl.className = 'msg assistant';
      currentAssistantMsgEl.innerHTML = '<div class="status-badge">Thinking...</div>';
      chatContainer.appendChild(currentAssistantMsgEl);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function renderMarkdown(content) {
      // Escape HTML
      let html = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks: triple-backtick fenced blocks
      html = html.replace(/\x60\x60\x60([a-zA-Z0-9_-]*)\n([\s\S]*?)\x60\x60\x60/g, (match, lang, code) => {
        const id = 'code_' + Math.random().toString(36).substring(2, 9);
        return '<div class="code-container">' +
          '<div class="code-header">' +
            '<span>' + (lang || 'code') + '</span>' +
            '<div class="code-actions">' +
              '<button onclick="copyCode(\'' + id + '\')">Copy</button>' +
              '<button onclick="insertCode(\'' + id + '\')">Insert</button>' +
              '<button onclick="replaceCode(\'' + id + '\')">Replace</button>' +
            '</div>' +
          '</div>' +
          '<pre id="' + id + '"><code>' + code + '</code></pre>' +
        '</div>';
      });

      // Inline code
      html = html.replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>');

      // Bold
      html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<b>$1</b>');

      return html.replace(/\\n/g, '<br/>');
    }

    window.copyCode = function(id) {
      const code = document.getElementById(id).innerText;
      navigator.clipboard.writeText(code);
    };

    window.insertCode = function(id) {
      const code = document.getElementById(id).innerText;
      vscode.postMessage({ type: 'insertAtCursor', text: code });
    };

    window.replaceCode = function(id) {
      const code = document.getElementById(id).innerText;
      vscode.postMessage({ type: 'replaceSelection', text: code });
    };

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'syncSettings': {
          modelSelect.innerHTML = '';
          message.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (m.id === message.settings.selectedModel) opt.selected = true;
            modelSelect.appendChild(opt);
          });
          openRouterInput.value = message.settings.openRouterApiKey || '';
          nvidiaInput.value = message.settings.nvidiaApiKey || '';
          customUrlInput.value = message.settings.customEndpointUrl || '';
          customKeyInput.value = message.settings.customApiKey || '';
          break;
        }
        case 'settingsSaved': {
          settingsDrawer.classList.remove('open');
          break;
        }
        case 'activeContext': {
          if (!message.hasContext) {
            alert('No active editor tab found.');
            return;
          }
          if (message.selectedText) {
            attachedContext = '\x60\x60\x60' + message.language + ' // ' + message.fileName + ' (Selected lines)\\n' + message.selectedText + '\\n\x60\x60\x60';
            addSelectionPill.classList.add('active');
          } else {
            attachedContext = '\x60\x60\x60' + message.language + ' // ' + message.fileName + '\\n' + message.fullText + '\\n\x60\x60\x60';
            addFilePill.classList.add('active');
          }
          break;
        }
        case 'status': {
          if (currentAssistantMsgEl) {
            let statusEl = currentAssistantMsgEl.querySelector('.status-badge');
            if (!statusEl) {
              statusEl = document.createElement('div');
              statusEl.className = 'status-badge';
              currentAssistantMsgEl.prepend(statusEl);
            }
            statusEl.textContent = message.text;
          }
          break;
        }
        case 'streamChunk': {
          if (!currentAssistantMsgEl) return;
          if (message.reasoning) {
            currentReasoningContent += message.reasoning;
          }
          if (message.content) {
            currentResponseContent += message.content;
          }

          let html = '';
          if (currentReasoningContent) {
            html += \`<details class="thinking-box" open>
              <summary>Thinking Process</summary>
              <div class="thinking-content">\${currentReasoningContent.replace(/</g, '&lt;')}</div>
            </details>\`;
          }
          html += renderMarkdown(currentResponseContent);

          currentAssistantMsgEl.innerHTML = html;
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
        }
        case 'streamDone': {
          isGenerating = false;
          sendBtn.disabled = false;
          if (currentResponseContent) {
            chatHistory.push({ role: 'assistant', content: currentResponseContent });
          }
          const thinkingBox = currentAssistantMsgEl?.querySelector('details.thinking-box');
          if (thinkingBox) thinkingBox.removeAttribute('open');
          break;
        }
        case 'error': {
          isGenerating = false;
          sendBtn.disabled = false;
          if (currentAssistantMsgEl) {
            currentAssistantMsgEl.innerHTML += \`<div style="color:#f87171;margin-top:6px;">⚠️ \${message.error}</div>\`;
          }
          break;
        }
      }
    });
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

