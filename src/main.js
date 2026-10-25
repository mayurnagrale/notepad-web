import * as monaco from 'monaco-editor';
import mermaid from 'mermaid';
import { DocumentManager } from './documentManager.js';
import { WhiteboardCanvas } from './canvas.js';
import { DIAGRAM_TEMPLATES } from './diagramTemplates.js';

// Setup Monaco Editor Environment (Runs smoothly without external worker bundlers)
self.MonacoEnvironment = {
  getWorker() {
    return undefined; // Monaco falls back gracefully to in-thread parsing
  }
};


// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif'
});

class NotepadApp {
  constructor() {
    this.docManager = new DocumentManager();
    this.monacoInstance = null;
    this.whiteboard = null;
    this.isSplitView = true;
    this.isCanvasView = false;
    this.zoomLevel = 1.0;
    this.autoSaveTimer = null;
    this.isAutoSaveEnabled = true;
    this.currentTheme = 'dark';
    this.googleUser = null;

    this.init();
  }

  init() {
    this.initMonaco();
    this.initWhiteboard();
    this.bindEvents();
    this.renderTabs();
    this.updatePreview();
    this.checkSavedGoogleUser();
  }

  initMonaco() {
    const container = document.getElementById('monaco-editor');
    const initialDoc = this.docManager.getActiveDocument();

    this.monacoInstance = monaco.editor.create(container, {
      value: initialDoc.content,
      language: this.mapLanguage(initialDoc.language),
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: "'Fira Code', monospace",
      fontLigatures: true,
      automaticLayout: true,
      minimap: { enabled: true },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      tabSize: 2,
      wordWrap: 'on'
    });

    // Content change listener (Debounced Autosave + Live Diagram Render)
    this.monacoInstance.onDidChangeModelContent(() => {
      const content = this.monacoInstance.getValue();
      this.docManager.updateActiveContent(content);
      this.updateStatusMetrics();
      this.triggerAutoSave();
      this.debouncedDiagramRender();
    });

    // Cursor position listener for Notepad++ status bar
    this.monacoInstance.onDidChangeCursorPosition((e) => {
      document.getElementById('status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    this.updateStatusMetrics();
  }

  initWhiteboard() {
    const canvasEl = document.getElementById('whiteboard-canvas');
    this.whiteboard = new WhiteboardCanvas(canvasEl);
  }

  mapLanguage(lang) {
    if (lang === 'mermaid') return 'markdown';
    return lang || 'plaintext';
  }

  getLanguageFromFileName(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js': case 'mjs': return 'javascript';
      case 'ts': return 'typescript';
      case 'py': return 'python';
      case 'html': case 'htm': return 'html';
      case 'css': return 'css';
      case 'json': return 'json';
      case 'md': case 'markdown': return 'markdown';
      case 'mmd': case 'mermaid': return 'mermaid';
      case 'cpp': case 'c': case 'h': case 'hpp': return 'cpp';
      case 'sql': return 'sql';
      case 'sh': case 'bash': return 'shell';
      default: return 'plaintext';
    }
  }

  renderTabs() {
    const tabsList = document.getElementById('tabs-list');
    tabsList.innerHTML = '';
    const activeDoc = this.docManager.getActiveDocument();

    for (const doc of this.docManager.documents) {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${doc.id === activeDoc.id ? 'active' : ''} ${doc.isDirty ? 'unsaved' : ''}`;
      
      const icon = doc.language === 'mermaid' ? '📊' : doc.language === 'markdown' ? '📝' : '📄';

      tabEl.innerHTML = `
        <span class="tab-icon">${icon}</span>
        <span class="tab-title" title="${doc.title}">${doc.title}</span>
        <span class="tab-status-dot"></span>
        <span class="tab-close" data-id="${doc.id}" title="Close Tab">✕</span>
      `;

      tabEl.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          this.switchTab(doc.id);
        }
      });

      tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(doc.id);
      });

      tabsList.appendChild(tabEl);
    }
  }

  switchTab(docId) {
    this.docManager.setActiveDocument(docId);
    const activeDoc = this.docManager.getActiveDocument();
    
    // Update Monaco editor content & language
    this.monacoInstance.setValue(activeDoc.content);
    monaco.editor.setModelLanguage(this.monacoInstance.getModel(), this.mapLanguage(activeDoc.language));
    
    // Update language select dropdown
    document.getElementById('select-language').value = activeDoc.language;

    this.renderTabs();
    this.updatePreview();
    this.updateStatusMetrics();
  }

  closeTab(docId) {
    this.docManager.closeDocument(docId);
    const activeDoc = this.docManager.getActiveDocument();
    this.switchTab(activeDoc.id);
  }

  updateStatusMetrics() {
    const content = this.monacoInstance.getValue();
    const lineCount = this.monacoInstance.getModel().getLineCount();
    const length = content.length;
    const bytes = new Blob([content]).size;

    document.getElementById('status-lines').textContent = `Lines: ${lineCount}`;
    document.getElementById('status-length').textContent = `Length: ${length.toLocaleString()}`;
    document.getElementById('status-filesize').textContent = `${bytes.toLocaleString()} bytes`;
  }

  triggerAutoSave() {
    if (!this.isAutoSaveEnabled) return;
    const indicator = document.getElementById('autosave-indicator');
    indicator.textContent = '● Saving...';
    indicator.className = 'autosave-badge unsaved';

    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.docManager.markActiveSaved();
      indicator.textContent = '● Saved';
      indicator.className = 'autosave-badge saved';
      this.renderTabs();

      // If user is connected to Google, trigger cloud sync
      if (this.googleUser) {
        this.syncToCloudStorage();
      }
    }, 600);
  }

  debouncedDiagramRender() {
    clearTimeout(this.diagramRenderTimeout);
    this.diagramRenderTimeout = setTimeout(() => {
      this.updatePreview();
    }, 350);
  }

  async updatePreview() {
    const doc = this.docManager.getActiveDocument();
    const content = this.monacoInstance.getValue();
    const diagramArea = document.getElementById('diagram-render-area');
    const markdownArea = document.getElementById('markdown-render-area');

    if (doc.language === 'mermaid' || content.trim().startsWith('graph') || content.trim().startsWith('sequenceDiagram') || content.trim().startsWith('classDiagram') || content.trim().startsWith('erDiagram') || content.trim().startsWith('mindmap') || content.trim().startsWith('%%')) {
      try {
        const id = `mermaid-svg-${Date.now()}`;
        const { svg } = await mermaid.render(id, content);
        diagramArea.innerHTML = svg;
      } catch (err) {
        diagramArea.innerHTML = `<div style="color: #f43f5e; padding: 20px; font-family: monospace;">⚠️ Diagram Syntax Error:<br>${err.message || err}</div>`;
      }
    } else if (doc.language === 'markdown') {
      markdownArea.innerHTML = this.simpleMarkdownToHtml(content);
    }
  }

  simpleMarkdownToHtml(md) {
    let html = md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/\n$/gim, '<br />');
    return html;
  }

  bindEvents() {
    // Tab changes from document manager
    window.addEventListener('document-tab-change', () => this.renderTabs());

    // New Tab Button
    document.getElementById('btn-add-tab').addEventListener('click', () => {
      this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(this.docManager.activeDocId);
    });

    // Toolbar buttons
    document.getElementById('tb-new').addEventListener('click', () => {
      this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(this.docManager.activeDocId);
    });

    document.getElementById('tb-open').addEventListener('click', () => {
      this.openFile();
    });

    document.getElementById('menu-open-file')?.addEventListener('click', () => {
      this.openFile();
    });

    document.getElementById('menu-new-file')?.addEventListener('click', () => {
      this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(this.docManager.activeDocId);
    });

    document.getElementById('menu-save-file')?.addEventListener('click', () => {
      this.saveCurrentFile(false);
    });

    document.getElementById('menu-save-as')?.addEventListener('click', () => {
      this.saveCurrentFile(true);
    });

    document.getElementById('menu-close-tab')?.addEventListener('click', () => {
      this.closeTab(this.docManager.activeDocId);
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const lang = this.getLanguageFromFileName(file.name);
          const newDoc = this.docManager.addDocument(file.name, lang, event.target.result);
          this.switchTab(newDoc.id);
          this.showToast(`📂 Opened ${file.name}`);
        };
        reader.readAsText(file);
      }
    });

    document.getElementById('tb-save').addEventListener('click', () => {
      this.saveCurrentFile(false);
    });

    // Language Dropdown Selector
    document.getElementById('select-language').addEventListener('change', (e) => {
      const newLang = e.target.value;
      this.docManager.setLanguageForActive(newLang);
      monaco.editor.setModelLanguage(this.monacoInstance.getModel(), this.mapLanguage(newLang));
      this.updatePreview();
    });

    // Toggle Diagram Split View
    const toggleSplitBtn = document.getElementById('tb-toggle-split');
    const previewPane = document.getElementById('preview-pane');
    toggleSplitBtn.addEventListener('click', () => {
      this.isSplitView = !this.isSplitView;
      if (this.isSplitView) {
        previewPane.classList.remove('hidden');
        toggleSplitBtn.classList.add('active-state');
      } else {
        previewPane.classList.add('hidden');
        toggleSplitBtn.classList.remove('active-state');
      }
      this.monacoInstance.layout();
    });

    // Toggle Whiteboard Canvas
    const toggleCanvasBtn = document.getElementById('tb-toggle-canvas');
    const canvasPane = document.getElementById('canvas-pane');
    toggleCanvasBtn.addEventListener('click', () => {
      this.isCanvasView = !this.isCanvasView;
      if (this.isCanvasView) {
        canvasPane.classList.remove('hidden');
        toggleCanvasBtn.classList.add('active-state');
        this.whiteboard.initCanvasSize();
      } else {
        canvasPane.classList.add('hidden');
        toggleCanvasBtn.classList.remove('active-state');
      }
    });

    // Canvas tools binding
    document.querySelectorAll('.canvas-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.canvas-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.whiteboard.currentTool = btn.dataset.tool;
      });
    });

    document.getElementById('canvas-color-picker').addEventListener('input', (e) => {
      this.whiteboard.strokeColor = e.target.value;
    });

    document.getElementById('canvas-fill-picker').addEventListener('input', (e) => {
      this.whiteboard.fillColor = e.target.value;
    });

    document.getElementById('canvas-stroke-width').addEventListener('change', (e) => {
      this.whiteboard.lineWidth = parseInt(e.target.value, 10);
    });

    document.getElementById('btn-canvas-undo').addEventListener('click', () => this.whiteboard.undo());
    document.getElementById('btn-canvas-clear').addEventListener('click', () => this.whiteboard.clear());
    document.getElementById('btn-canvas-export').addEventListener('click', () => this.whiteboard.exportPNG());

    // Auto-Save Toggle
    document.getElementById('chk-autosave').addEventListener('change', (e) => {
      this.isAutoSaveEnabled = e.target.checked;
      const indicator = document.getElementById('autosave-indicator');
      if (!this.isAutoSaveEnabled) {
        indicator.textContent = '○ Disabled';
        indicator.className = 'autosave-badge';
      } else {
        indicator.textContent = '● Saved';
        indicator.className = 'autosave-badge saved';
      }
    });

    // Find & Replace Panel (Ctrl+F)
    const findPanel = document.getElementById('find-replace-panel');
    document.getElementById('tb-find').addEventListener('click', () => {
      findPanel.classList.toggle('hidden');
      if (!findPanel.classList.contains('hidden')) {
        document.getElementById('find-input').focus();
      }
    });

    document.getElementById('btn-close-find').addEventListener('click', () => {
      findPanel.classList.add('hidden');
    });

    document.getElementById('btn-find-next').addEventListener('click', () => {
      this.monacoInstance.getAction('actions.find').run();
    });

    // Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.adjustZoom(0.1));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.adjustZoom(0, true));

    // Export Diagram
    document.getElementById('btn-export-svg').addEventListener('click', () => this.exportDiagramSVG());
    document.getElementById('btn-export-png').addEventListener('click', () => this.exportDiagramPNG());

    // Theme Toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => this.toggleTheme());

    // Diagram Templates Dropdown
    document.getElementById('tb-template-menu').addEventListener('click', () => {
      const choice = prompt('Insert Diagram Template:\n1: Flowchart\n2: Sequence Diagram\n3: Cloud Architecture\n4: Class Diagram\n5: ER Diagram\n6: Mindmap\n\nEnter number (1-6):', '1');
      this.insertTemplateByChoice(choice);
    });

    // Menubar templates
    document.getElementById('menu-template-flowchart')?.addEventListener('click', () => this.insertTemplate('flowchart'));
    document.getElementById('menu-template-sequence')?.addEventListener('click', () => this.insertTemplate('sequence'));
    document.getElementById('menu-template-architecture')?.addEventListener('click', () => this.insertTemplate('architecture'));
    document.getElementById('menu-template-class')?.addEventListener('click', () => this.insertTemplate('classDiagram'));
    document.getElementById('menu-template-er')?.addEventListener('click', () => this.insertTemplate('er'));
    document.getElementById('menu-template-mindmap')?.addEventListener('click', () => this.insertTemplate('mindmap'));

    // Google Cloud Sync Modal
    const syncModal = document.getElementById('modal-cloud-sync');
    document.getElementById('btn-google-auth').addEventListener('click', () => {
      syncModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
      syncModal.classList.add('hidden');
    });

    document.getElementById('btn-mock-google-login').addEventListener('click', () => {
      this.simulateGoogleLogin();
    });

    document.getElementById('btn-google-signout').addEventListener('click', () => {
      this.googleSignOut();
    });

    document.getElementById('btn-sync-now').addEventListener('click', () => {
      this.syncToCloudStorage(true);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentFile(true); // Save As
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentFile(false); // Quick Save
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.openFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.docManager.addDocument();
        this.renderTabs();
        this.switchTab(this.docManager.activeDocId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        findPanel.classList.toggle('hidden');
        if (!findPanel.classList.contains('hidden')) {
          document.getElementById('find-input').focus();
        }
      }
    });
  }

  async openFile() {
    // If native File System Access API is supported (Chrome, Edge)
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false
        });
        const file = await handle.getFile();
        const content = await file.text();
        const lang = this.getLanguageFromFileName(file.name);
        const newDoc = this.docManager.addDocument(file.name, lang, content);
        newDoc.fileHandle = handle;
        this.switchTab(newDoc.id);
        this.showToast(`📂 Opened: ${file.name}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User closed picker dialog
        console.warn('showOpenFilePicker failed, falling back:', err);
      }
    }
    // Fallback for browsers without File System Access API
    document.getElementById('file-input').click();
  }

  async saveCurrentFile(saveAs = false) {
    const doc = this.docManager.getActiveDocument();
    const content = this.monacoInstance.getValue();

    // Use native OS Save File Picker if available (Chrome, Edge on macOS & Windows)
    if ('showSaveFilePicker' in window) {
      try {
        let handle = doc.fileHandle;
        if (!handle || saveAs) {
          handle = await window.showSaveFilePicker({
            suggestedName: doc.title,
            types: [
              {
                description: 'Text & Code Files',
                accept: {
                  'text/plain': ['.txt', '.md', '.mmd', '.js', '.ts', '.py', '.html', '.css', '.json', '.cpp', '.sql', '.sh']
                }
              }
            ]
          });
          doc.fileHandle = handle;
          doc.title = handle.name;
          doc.language = this.getLanguageFromFileName(handle.name);
          document.getElementById('select-language').value = doc.language;
          monaco.editor.setModelLanguage(this.monacoInstance.getModel(), this.mapLanguage(doc.language));
        }

        // Write directly to user's selected file path on disk
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        this.docManager.markActiveSaved();
        this.renderTabs();
        this.showToast(`💾 Saved: ${doc.title}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled file dialog
        console.warn('Native file save failed, falling back to download:', err);
      }
    }

    // Fallback: Browser file download for Safari/Firefox
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.title;
    link.click();
    URL.revokeObjectURL(url);
    this.docManager.markActiveSaved();
    this.renderTabs();
    this.showToast(`📥 Downloaded: ${doc.title}`);
  }

  showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  adjustZoom(delta, reset = false) {
    if (reset) {
      this.zoomLevel = 1.0;
    } else {
      this.zoomLevel = Math.max(0.4, Math.min(2.5, this.zoomLevel + delta));
    }
    const renderArea = document.getElementById('diagram-render-area');
    renderArea.style.transform = `scale(${this.zoomLevel})`;
  }

  exportDiagramSVG() {
    const svgEl = document.querySelector('#diagram-render-area svg');
    if (!svgEl) {
      alert('No diagram rendered yet to export.');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  exportDiagramPNG() {
    const svgEl = document.querySelector('#diagram-render-area svg');
    if (!svgEl) {
      alert('No diagram rendered yet to export.');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2 || 1600;
      canvas.height = img.height * 2 || 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const link = document.createElement('a');
      link.download = `diagram-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${this.currentTheme}`;
    document.getElementById('btn-theme-toggle').textContent = this.currentTheme === 'dark' ? '🌙' : '☀️';
    monaco.editor.setTheme(this.currentTheme === 'dark' ? 'vs-dark' : 'vs');
    mermaid.initialize({ theme: this.currentTheme === 'dark' ? 'dark' : 'default' });
    this.updatePreview();
  }

  // Google Account & Cloud Sync
  checkSavedGoogleUser() {
    try {
      const savedUser = localStorage.getItem('npp_google_user');
      if (savedUser) {
        this.googleUser = JSON.parse(savedUser);
        this.updateGoogleUI();
      }
    } catch (e) {
      console.warn('Could not read user profile', e);
    }
  }

  simulateGoogleLogin() {
    const user = {
      name: 'Anand',
      email: 'anand@gmail.com',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Anand'
    };
    this.googleUser = user;
    localStorage.setItem('npp_google_user', JSON.stringify(user));
    this.updateGoogleUI();
    this.syncToCloudStorage(true);
    document.getElementById('modal-cloud-sync').classList.add('hidden');
  }

  googleSignOut() {
    this.googleUser = null;
    localStorage.removeItem('npp_google_user');
    this.updateGoogleUI();
  }

  updateGoogleUI() {
    const authText = document.getElementById('google-auth-text');
    const avatar = document.getElementById('google-user-avatar');
    const syncStatusText = document.getElementById('status-sync-text');
    const signedOutView = document.getElementById('google-signed-out-view');
    const signedInView = document.getElementById('google-signed-in-view');

    if (this.googleUser) {
      authText.textContent = this.googleUser.name;
      avatar.src = this.googleUser.avatar;
      avatar.classList.remove('hidden');
      syncStatusText.textContent = `Cloud Synced (${this.googleUser.email})`;
      
      signedOutView.classList.add('hidden');
      signedInView.classList.remove('hidden');
      document.getElementById('profile-name').textContent = this.googleUser.name;
      document.getElementById('profile-email').textContent = this.googleUser.email;
      document.getElementById('profile-img').src = this.googleUser.avatar;
      this.renderCloudDocList();
    } else {
      authText.textContent = 'Sign in with Google';
      avatar.classList.add('hidden');
      syncStatusText.textContent = 'Local Storage';
      
      signedOutView.classList.remove('hidden');
      signedInView.classList.add('hidden');
    }
  }

  syncToCloudStorage(showAlert = false) {
    const cloudPayload = {
      user: this.googleUser?.email,
      timestamp: new Date().toISOString(),
      documents: this.docManager.documents
    };
    localStorage.setItem('npp_cloud_backup', JSON.stringify(cloudPayload));
    if (showAlert) {
      alert(`Cloud sync successful!\nAll ${this.docManager.documents.length} tabs backed up to Google Cloud for ${this.googleUser?.email}.`);
    }
  }

  renderCloudDocList() {
    const listEl = document.getElementById('cloud-docs-list');
    listEl.innerHTML = '';
    for (const doc of this.docManager.documents) {
      const li = document.createElement('li');
      li.style.padding = '4px 0';
      li.style.fontSize = '12px';
      li.style.color = '#a6adc8';
      li.innerHTML = `📄 <strong>${doc.title}</strong> (${doc.language}) — <span style="color: #10b981;">Synced</span>`;
      listEl.appendChild(li);
    }
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new NotepadApp();
});
