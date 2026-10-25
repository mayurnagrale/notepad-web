import * as monaco from 'monaco-editor';
import mermaid from 'mermaid';
import { marked } from 'marked';
import { DocumentManager, DEFAULT_DIAGRAM_TEMPLATE } from './documentManager.js';
import { WhiteboardCanvas } from './canvas.js';
import { DIAGRAM_TEMPLATES } from './diagramTemplates.js';

// Setup Monaco Editor Environment (Graceful fallback)
self.MonacoEnvironment = {
  getWorker() {
    return undefined;
  }
};

// Configure Marked for safe and clean markdown
marked.setOptions({
  breaks: true,
  gfm: true
});

// Initialize Mermaid Diagram Engine
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
    
    // View state
    this.activeViewMode = 'notebook'; // 'notebook' or 'raw'
    this.isStudioOpen = false;
    this.studioTab = 'mermaid'; // 'mermaid' or 'canvas'
    this.studioZoom = 1.0;
    this.autoSaveTimer = null;
    this.isAutoSaveEnabled = true;
    this.currentTheme = 'dark';
    this.googleUser = null;
    this.draggedSectionIndex = null;
    this.editingSectionId = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.initStudio();
    this.renderTabs();
    this.renderNotebook();
    this.checkSavedGoogleUser();
    this.updateStatusMetrics();
  }

  // =========================================================================
  // Document Tabs Management
  // =========================================================================
  renderTabs() {
    const tabsList = document.getElementById('tabs-list');
    if (!tabsList) return;
    tabsList.innerHTML = '';
    const activeDoc = this.docManager.getActiveDocument();

    for (const doc of this.docManager.documents) {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${doc.id === activeDoc.id ? 'active' : ''} ${doc.isDirty ? 'unsaved' : ''}`;
      
      tabEl.innerHTML = `
        <span class="tab-icon">📄</span>
        <span class="tab-title" title="${this.escapeHtml(doc.title)}">${this.escapeHtml(doc.title)}</span>
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
    this.renderTabs();
    if (this.activeViewMode === 'notebook') {
      this.renderNotebook();
    } else {
      this.syncToRawMonaco();
    }
    this.updateStatusMetrics();
  }

  closeTab(docId) {
    this.docManager.closeDocument(docId);
    this.renderTabs();
    this.renderNotebook();
    this.updateStatusMetrics();
  }

  // =========================================================================
  // Jupyter-Style Notebook Rendering (Notes & Diagrams)
  // =========================================================================
  renderNotebook() {
    const activeDoc = this.docManager.getActiveDocument();
    const titleEl = document.getElementById('notebook-doc-title');
    const countEl = document.getElementById('notebook-section-count');
    const container = document.getElementById('sections-container');

    if (!container || !activeDoc) return;

    if (titleEl && document.activeElement !== titleEl) {
      titleEl.textContent = activeDoc.title;
    }
    if (countEl) {
      const count = activeDoc.sections ? activeDoc.sections.length : 0;
      countEl.textContent = `${count} ${count === 1 ? 'Section' : 'Sections'}`;
    }

    container.innerHTML = '';

    const sections = activeDoc.sections || [];
    sections.forEach((sec, index) => {
      // Top insertion divider
      const dividerTop = this.createInsertDivider(index);
      container.appendChild(dividerTop);

      // Section Card
      const card = this.createSectionCard(sec, index);
      container.appendChild(card);
    });

    // Final insertion divider at bottom
    if (sections.length > 0) {
      const dividerBottom = this.createInsertDivider(sections.length);
      container.appendChild(dividerBottom);
    }

    this.updateStatusMetrics();
  }

  createInsertDivider(insertIndex) {
    const div = document.createElement('div');
    div.className = 'section-insert-divider';
    div.dataset.index = insertIndex;

    div.innerHTML = `
      <div class="divider-buttons">
        <button class="btn-divider-add" data-action="add-note" data-index="${insertIndex}">+ Note</button>
        <button class="btn-divider-add" data-action="add-diagram" data-index="${insertIndex}">+ Diagram</button>
      </div>
    `;

    // Click to insert
    div.querySelector('[data-action="add-note"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.docManager.addSection('note', '', 'Notes', insertIndex);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    div.querySelector('[data-action="add-diagram"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.docManager.addSection('diagram', DEFAULT_DIAGRAM_TEMPLATE, 'Diagram', insertIndex);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    // Drop zone for dragging from Studio or reordering sections
    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      div.classList.add('drop-target-active');
    });

    div.addEventListener('dragleave', () => {
      div.classList.remove('drop-target-active');
    });

    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drop-target-active');
      this.handleDropAt(e, insertIndex);
    });

    return div;
  }

  createSectionCard(sec, index) {
    const card = document.createElement('div');
    card.className = `notebook-section ${sec.type === 'diagram' ? 'diagram-section' : 'note-section'}`;
    card.dataset.id = sec.id;
    card.dataset.index = index;

    const isDiagram = sec.type === 'diagram';

    // Header
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <span class="section-drag-handle" draggable="true" title="Drag to reorder section">⠿</span>
      <span class="section-badge">${isDiagram ? '📊 Diagram' : '📝 Note'} [${index + 1}]</span>
      <span class="section-title" contenteditable="true" spellcheck="false">${this.escapeHtml(sec.title || (isDiagram ? 'Diagram' : 'Notes'))}</span>
      <div class="section-actions">
        ${isDiagram ? `<button class="btn-section-action" data-action="edit-in-studio" title="Open in Diagram Studio">🎨 Edit in Studio</button>` : ''}
        ${isDiagram ? `<button class="btn-section-action" data-action="toggle-code" title="Edit Mermaid Code">⚡ Edit Code</button>` : ''}
        ${isDiagram ? `<button class="btn-section-action" data-action="export-png" title="Export PNG">PNG 📥</button>` : ''}
        <button class="btn-section-action" data-action="move-up" title="Move Up (Ctrl+Up)">⬆️</button>
        <button class="btn-section-action" data-action="move-down" title="Move Down (Ctrl+Down)">⬇️</button>
        <button class="btn-section-action danger" data-action="delete" title="Delete Section">🗑️</button>
      </div>
    `;

    // Title editing
    const titleSpan = header.querySelector('.section-title');
    titleSpan.addEventListener('blur', () => {
      const newTitle = titleSpan.textContent.trim();
      this.docManager.updateSection(sec.id, undefined, newTitle);
    });

    // Drag handle for section reordering
    const dragHandle = header.querySelector('.section-drag-handle');
    dragHandle.addEventListener('dragstart', (e) => {
      this.draggedSectionIndex = index;
      e.dataTransfer.setData('application/json', JSON.stringify({
        source: 'reorder',
        fromIndex: index
      }));
      card.classList.add('dragging');
    });

    dragHandle.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this.draggedSectionIndex = null;
    });

    // Header action buttons
    header.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      this.docManager.moveSection(sec.id, -1);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    header.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      this.docManager.moveSection(sec.id, 1);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    header.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      this.docManager.deleteSection(sec.id);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    if (isDiagram) {
      header.querySelector('[data-action="edit-in-studio"]')?.addEventListener('click', () => {
        this.openStudioWithSection(sec);
      });

      header.querySelector('[data-action="export-png"]')?.addEventListener('click', () => {
        this.exportSectionDiagramPNG(sec.id);
      });
    }

    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'section-body';

    if (isDiagram) {
      // Diagram Section Body
      const display = document.createElement('div');
      display.className = 'diagram-display';
      display.id = `diagram-view-${sec.id}`;
      display.innerHTML = `<span style="color: var(--text-muted); font-size: 12px;">Rendering diagram...</span>`;

      // Inline code editor (collapsible)
      const inlineEditor = document.createElement('div');
      inlineEditor.className = 'diagram-inline-editor hidden';
      inlineEditor.innerHTML = `
        <textarea class="diagram-code-textarea" spellcheck="false">${this.escapeHtml(sec.content)}</textarea>
      `;

      const textarea = inlineEditor.querySelector('.diagram-code-textarea');
      let renderTimeout;
      textarea.addEventListener('input', () => {
        const val = textarea.value;
        this.docManager.updateSection(sec.id, val);
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
          this.renderMermaidDiagramInto(display, val, sec.id);
          this.triggerAutoSave();
        }, 400);
      });

      header.querySelector('[data-action="toggle-code"]')?.addEventListener('click', () => {
        inlineEditor.classList.toggle('hidden');
        if (!inlineEditor.classList.contains('hidden')) {
          textarea.focus();
        }
      });

      body.appendChild(display);
      body.appendChild(inlineEditor);

      // Async render mermaid diagram
      setTimeout(() => {
        this.renderMermaidDiagramInto(display, sec.content, sec.id);
      }, 20);

    } else {
      // Note Section Body
      const isEditing = this.editingSectionId === sec.id;
      
      const previewDiv = document.createElement('div');
      previewDiv.className = `note-preview ${isEditing ? 'hidden' : ''}`;
      
      if (!sec.content || !sec.content.trim()) {
        previewDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">Empty note. Click to start typing...</p>`;
      } else {
        try {
          previewDiv.innerHTML = marked.parse(sec.content);
        } catch {
          previewDiv.textContent = sec.content;
        }
      }

      const textarea = document.createElement('textarea');
      textarea.className = `note-textarea ${isEditing ? '' : 'hidden'}`;
      textarea.placeholder = 'Type your notes here... (Markdown supported: # Headings, **bold**, *italic*, - lists, `code`)';
      textarea.value = sec.content || '';

      const autoResize = (el) => {
        el.style.height = 'auto';
        el.style.height = Math.max(80, el.scrollHeight) + 'px';
      };

      // Click preview to edit
      previewDiv.addEventListener('click', () => {
        this.editingSectionId = sec.id;
        previewDiv.classList.add('hidden');
        textarea.classList.remove('hidden');
        autoResize(textarea);
        textarea.focus();
        card.classList.add('active-focus');
      });

      // Textarea input
      textarea.addEventListener('input', () => {
        autoResize(textarea);
        this.docManager.updateSection(sec.id, textarea.value);
        this.triggerAutoSave();
      });

      // Blur to render
      textarea.addEventListener('blur', () => {
        this.editingSectionId = null;
        textarea.classList.add('hidden');
        previewDiv.classList.remove('hidden');
        card.classList.remove('active-focus');
        try {
          previewDiv.innerHTML = sec.content && sec.content.trim() 
            ? marked.parse(sec.content) 
            : `<p style="color: var(--text-muted); font-style: italic;">Empty note. Click to start typing...</p>`;
        } catch {
          previewDiv.textContent = sec.content;
        }
      });

      body.appendChild(previewDiv);
      body.appendChild(textarea);
      if (isEditing) {
        setTimeout(() => autoResize(textarea), 0);
      }
    }

    card.appendChild(body);
    return card;
  }

  async renderMermaidDiagramInto(container, code, secId) {
    if (!container) return;
    const trimmed = (code || '').trim();
    if (!trimmed) {
      container.innerHTML = `<span style="color: var(--text-muted);">Empty diagram</span>`;
      return;
    }

    const uniqueId = `mermaid-render-${secId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
    try {
      const { svg } = await mermaid.render(uniqueId, trimmed);
      container.innerHTML = svg;
    } catch (err) {
      container.innerHTML = `<div style="color: var(--accent-rose); font-size: 12px; font-family: var(--font-code); padding: 12px; text-align: left;">
        ⚠️ Diagram Error: ${err.message || 'Invalid diagram syntax'}
      </div>`;
    }
  }

  // =========================================================================
  // Drag & Drop Handler (From Studio or Reorder)
  // =========================================================================
  handleDropAt(e, targetIndex) {
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      if (data.source === 'studio') {
        // Dragged diagram from Studio into Notebook!
        this.docManager.addSection('diagram', data.content || DEFAULT_DIAGRAM_TEMPLATE, 'Diagram', targetIndex);
        this.renderNotebook();
        this.triggerAutoSave();
        this.showToast('📊 Diagram added to Notepad!');
      } else if (data.source === 'reorder') {
        // Reordering sections
        const fromIndex = data.fromIndex;
        let dest = targetIndex;
        if (fromIndex < targetIndex) dest--;
        this.docManager.reorderSections(fromIndex, dest);
        this.renderNotebook();
        this.triggerAutoSave();
      }
    } catch (err) {
      console.warn('Drop handling error', err);
    }
  }

  // =========================================================================
  // Diagram Studio (Separate Feature Drawer)
  // =========================================================================
  initStudio() {
    const studioEl = document.getElementById('diagram-studio');
    const textarea = document.getElementById('studio-mermaid-input');
    const templateSelect = document.getElementById('select-diagram-template');
    const applyBtn = document.getElementById('btn-apply-template');
    const insertBtn = document.getElementById('btn-insert-studio-diagram');
    const closeBtn = document.getElementById('btn-close-studio');
    const dragCard = document.getElementById('studio-drag-handle');

    if (textarea) {
      textarea.value = DEFAULT_DIAGRAM_TEMPLATE;
      let timeout;
      textarea.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.updateStudioDiagramPreview(), 300);
      });
    }

    if (applyBtn && templateSelect && textarea) {
      applyBtn.addEventListener('click', () => {
        const key = templateSelect.value;
        if (DIAGRAM_TEMPLATES[key]) {
          textarea.value = DIAGRAM_TEMPLATES[key];
          this.updateStudioDiagramPreview();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleStudio(false));
    }

    if (insertBtn) {
      insertBtn.addEventListener('click', () => {
        const code = textarea ? textarea.value : DEFAULT_DIAGRAM_TEMPLATE;
        this.docManager.addSection('diagram', code, 'Diagram');
        this.renderNotebook();
        this.triggerAutoSave();
        this.showToast('📊 Diagram inserted into Notepad!');
      });
    }

    // Draggable card from studio into notepad
    if (dragCard) {
      dragCard.addEventListener('dragstart', (e) => {
        const code = textarea ? textarea.value : DEFAULT_DIAGRAM_TEMPLATE;
        e.dataTransfer.setData('application/json', JSON.stringify({
          source: 'studio',
          content: code,
          type: 'diagram'
        }));
      });
    }

    // Studio tabs (Mermaid vs Canvas)
    const tabMermaid = document.getElementById('tab-studio-mermaid');
    const tabCanvas = document.getElementById('tab-studio-canvas');
    const panelMermaid = document.getElementById('studio-panel-mermaid');
    const panelCanvas = document.getElementById('studio-panel-canvas');

    tabMermaid?.addEventListener('click', () => {
      tabMermaid.classList.add('active');
      tabCanvas?.classList.remove('active');
      panelMermaid?.classList.remove('hidden');
      panelCanvas?.classList.add('hidden');
    });

    tabCanvas?.addEventListener('click', () => {
      tabCanvas.classList.add('active');
      tabMermaid?.classList.remove('active');
      panelCanvas?.classList.remove('hidden');
      panelMermaid?.classList.add('hidden');
      if (!this.whiteboard) {
        const canvasEl = document.getElementById('whiteboard-canvas');
        if (canvasEl) this.whiteboard = new WhiteboardCanvas(canvasEl);
      } else {
        this.whiteboard.initCanvasSize();
      }
    });

    // Studio zoom & export
    document.getElementById('btn-studio-zoom-in')?.addEventListener('click', () => this.adjustStudioZoom(0.1));
    document.getElementById('btn-studio-zoom-out')?.addEventListener('click', () => this.adjustStudioZoom(-0.1));
    document.getElementById('btn-studio-zoom-reset')?.addEventListener('click', () => this.adjustStudioZoom(0, true));
    document.getElementById('btn-studio-export-png')?.addEventListener('click', () => this.exportStudioPNG());
    document.getElementById('btn-studio-export-svg')?.addEventListener('click', () => this.exportStudioSVG());
  }

  toggleStudio(forceState = null) {
    const studioEl = document.getElementById('diagram-studio');
    const btn = document.getElementById('tb-open-studio');
    if (!studioEl) return;

    this.isStudioOpen = forceState !== null ? forceState : !this.isStudioOpen;

    if (this.isStudioOpen) {
      studioEl.classList.remove('hidden');
      btn?.classList.add('active-state');
      this.updateStudioDiagramPreview();
    } else {
      studioEl.classList.add('hidden');
      btn?.classList.remove('active-state');
    }
  }

  openStudioWithSection(sec) {
    const textarea = document.getElementById('studio-mermaid-input');
    if (textarea) {
      textarea.value = sec.content;
    }
    this.toggleStudio(true);
  }

  async updateStudioDiagramPreview() {
    const textarea = document.getElementById('studio-mermaid-input');
    const previewArea = document.getElementById('studio-diagram-preview');
    if (!textarea || !previewArea) return;

    const code = textarea.value.trim();
    if (!code) {
      previewArea.innerHTML = `<span style="color: var(--text-muted);">Enter diagram code above</span>`;
      return;
    }

    const uniqueId = `mermaid-studio-${Date.now()}`;
    try {
      const { svg } = await mermaid.render(uniqueId, code);
      previewArea.innerHTML = svg;
      const svgEl = previewArea.querySelector('svg');
      if (svgEl) svgEl.style.transform = `scale(${this.studioZoom})`;
    } catch (err) {
      previewArea.innerHTML = `<div style="color: var(--accent-rose); font-size: 11px; padding: 10px;">⚠️ ${err.message || err}</div>`;
    }
  }

  adjustStudioZoom(delta, reset = false) {
    this.studioZoom = reset ? 1.0 : Math.max(0.4, Math.min(2.5, this.studioZoom + delta));
    const svgEl = document.querySelector('#studio-diagram-preview svg');
    if (svgEl) svgEl.style.transform = `scale(${this.studioZoom})`;
  }

  exportStudioSVG() {
    const svgEl = document.querySelector('#studio-diagram-preview svg');
    if (!svgEl) return this.showToast('No diagram to export');
    const svgData = new XMLSerializer().serializeToString(svgEl);
    this.downloadFile(`diagram-${Date.now()}.svg`, 'image/svg+xml;charset=utf-8', svgData);
  }

  exportStudioPNG() {
    const svgEl = document.querySelector('#studio-diagram-preview svg');
    if (!svgEl) return this.showToast('No diagram to export');
    this.exportSvgAsPng(svgEl, `diagram-${Date.now()}.png`);
  }

  exportSectionDiagramPNG(secId) {
    const svgEl = document.querySelector(`#diagram-view-${secId} svg`);
    if (!svgEl) return this.showToast('No diagram to export');
    this.exportSvgAsPng(svgEl, `diagram-${secId}.png`);
  }

  exportSvgAsPng(svgEl, filename) {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1200, (img.width || 800) * 2);
      canvas.height = Math.max(800, (img.height || 600) * 2);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = this.currentTheme === 'dark' ? '#181825' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // =========================================================================
  // Raw Code View & Monaco Toggle
  // =========================================================================
  toggleViewMode() {
    const nbWorkspace = document.getElementById('notebook-workspace');
    const rawWorkspace = document.getElementById('raw-workspace');
    const toggleBtn = document.getElementById('tb-toggle-view');

    if (this.activeViewMode === 'notebook') {
      this.activeViewMode = 'raw';
      nbWorkspace?.classList.add('hidden');
      rawWorkspace?.classList.remove('hidden');
      if (toggleBtn) toggleBtn.textContent = '💻 Raw Code Mode';
      this.syncToRawMonaco();
    } else {
      this.activeViewMode = 'notebook';
      if (this.monacoInstance) {
        const rawContent = this.monacoInstance.getValue();
        const activeDoc = this.docManager.getActiveDocument();
        activeDoc.sections = this.docManager.parseContentIntoSections(rawContent, activeDoc.language);
        this.docManager.saveSession();
      }
      rawWorkspace?.classList.add('hidden');
      nbWorkspace?.classList.remove('hidden');
      if (toggleBtn) toggleBtn.textContent = '📓 Notebook Mode';
      this.renderNotebook();
    }
  }

  syncToRawMonaco() {
    const container = document.getElementById('monaco-editor');
    const activeDoc = this.docManager.getActiveDocument();
    const serialized = this.docManager.serializeDocument(activeDoc);

    if (!this.monacoInstance && container) {
      this.monacoInstance = monaco.editor.create(container, {
        value: serialized,
        language: 'markdown',
        theme: this.currentTheme === 'dark' ? 'vs-dark' : 'vs',
        fontSize: 14,
        fontFamily: "'Fira Code', monospace",
        automaticLayout: true,
        wordWrap: 'on'
      });

      this.monacoInstance.onDidChangeModelContent(() => {
        this.triggerAutoSave();
        this.updateStatusMetrics();
      });
    } else if (this.monacoInstance) {
      this.monacoInstance.setValue(serialized);
      this.monacoInstance.layout();
    }
  }

  // =========================================================================
  // UI Event Bindings
  // =========================================================================
  bindEvents() {
    // Toolbar buttons
    document.getElementById('tb-new')?.addEventListener('click', () => {
      const newDoc = this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(newDoc.id);
    });

    document.getElementById('menu-new-file')?.addEventListener('click', () => {
      const newDoc = this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(newDoc.id);
    });

    document.getElementById('btn-add-tab')?.addEventListener('click', () => {
      const newDoc = this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(newDoc.id);
    });

    // Add note and diagram section from toolbar
    document.getElementById('tb-add-note')?.addEventListener('click', () => {
      this.docManager.addSection('note', '', 'Notes');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('tb-add-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram', DEFAULT_DIAGRAM_TEMPLATE, 'Diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('menu-insert-note')?.addEventListener('click', () => {
      this.docManager.addSection('note', '', 'Notes');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('menu-insert-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram', DEFAULT_DIAGRAM_TEMPLATE, 'Diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    // Bottom action buttons
    document.getElementById('btn-bottom-add-note')?.addEventListener('click', () => {
      this.docManager.addSection('note', '', 'Notes');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('btn-bottom-add-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram', DEFAULT_DIAGRAM_TEMPLATE, 'Diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('btn-bottom-open-studio')?.addEventListener('click', () => {
      this.toggleStudio(true);
    });

    // Studio toggles
    document.getElementById('tb-open-studio')?.addEventListener('click', () => {
      this.toggleStudio();
    });

    document.getElementById('menu-open-studio')?.addEventListener('click', () => {
      this.toggleStudio(true);
    });

    document.getElementById('menu-toggle-studio')?.addEventListener('click', () => {
      this.toggleStudio();
    });

    // Toggle view mode
    document.getElementById('tb-toggle-view')?.addEventListener('click', () => {
      this.toggleViewMode();
    });

    document.getElementById('menu-toggle-view')?.addEventListener('click', () => {
      this.toggleViewMode();
    });

    // File operations
    document.getElementById('tb-open')?.addEventListener('click', () => this.openFile());
    document.getElementById('menu-open-file')?.addEventListener('click', () => this.openFile());
    document.getElementById('tb-save')?.addEventListener('click', () => this.saveCurrentFile(false));
    document.getElementById('menu-save-file')?.addEventListener('click', () => this.saveCurrentFile(false));
    document.getElementById('menu-save-as')?.addEventListener('click', () => this.saveCurrentFile(true));
    document.getElementById('menu-close-tab')?.addEventListener('click', () => this.closeTab(this.docManager.activeDocId));

    document.getElementById('menu-export-markdown')?.addEventListener('click', () => this.exportMarkdown());
    document.getElementById('menu-export-html')?.addEventListener('click', () => this.exportHTML());

    // File input fallback
    document.getElementById('file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const newDoc = this.docManager.addDocument(file.name, 'markdown', event.target.result);
          this.switchTab(newDoc.id);
          this.showToast(`📂 Opened: ${file.name}`);
        };
        reader.readAsText(file);
      }
    });

    // Editable doc title
    const docTitleEl = document.getElementById('notebook-doc-title');
    docTitleEl?.addEventListener('blur', () => {
      const activeDoc = this.docManager.getActiveDocument();
      if (activeDoc) {
        activeDoc.title = docTitleEl.textContent.trim() || 'Untitled.txt';
        this.docManager.saveSession();
        this.renderTabs();
      }
    });

    // Undo / Redo
    document.getElementById('tb-undo')?.addEventListener('click', () => {
      if (this.monacoInstance && this.activeViewMode === 'raw') {
        this.monacoInstance.trigger('source', 'undo');
      } else {
        this.showToast('↩️ Undo');
      }
    });

    document.getElementById('tb-redo')?.addEventListener('click', () => {
      if (this.monacoInstance && this.activeViewMode === 'raw') {
        this.monacoInstance.trigger('source', 'redo');
      } else {
        this.showToast('↪️ Redo');
      }
    });

    document.getElementById('menu-undo')?.addEventListener('click', () => {
      this.monacoInstance?.trigger('source', 'undo');
    });

    document.getElementById('menu-redo')?.addEventListener('click', () => {
      this.monacoInstance?.trigger('source', 'redo');
    });

    // Find panel
    const findPanel = document.getElementById('find-replace-panel');
    document.getElementById('tb-find')?.addEventListener('click', () => {
      findPanel?.classList.toggle('hidden');
      if (findPanel && !findPanel.classList.contains('hidden')) {
        document.getElementById('find-input')?.focus();
      }
    });

    document.getElementById('menu-find')?.addEventListener('click', () => {
      findPanel?.classList.remove('hidden');
      document.getElementById('find-input')?.focus();
    });

    document.getElementById('btn-close-find')?.addEventListener('click', () => {
      findPanel?.classList.add('hidden');
    });

    // Auto-save toggle
    document.getElementById('chk-autosave')?.addEventListener('change', (e) => {
      this.isAutoSaveEnabled = e.target.checked;
      const indicator = document.getElementById('autosave-indicator');
      if (indicator) {
        indicator.textContent = this.isAutoSaveEnabled ? '● Saved' : '○ Disabled';
        indicator.className = `autosave-badge ${this.isAutoSaveEnabled ? 'saved' : ''}`;
      }
    });

    // Theme toggle
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.toggleTheme());

    // Google Cloud Sync Modal
    const syncModal = document.getElementById('modal-cloud-sync');
    document.getElementById('btn-google-auth')?.addEventListener('click', () => syncModal?.classList.remove('hidden'));
    document.getElementById('btn-close-modal')?.addEventListener('click', () => syncModal?.classList.add('hidden'));
    document.getElementById('btn-mock-google-login')?.addEventListener('click', () => this.simulateGoogleLogin());
    document.getElementById('btn-google-signout')?.addEventListener('click', () => this.googleSignOut());
    document.getElementById('btn-sync-now')?.addEventListener('click', () => this.syncToCloudStorage(true));
    document.getElementById('menu-google-sync')?.addEventListener('click', () => syncModal?.classList.remove('hidden'));
    document.getElementById('menu-manual-cloud-backup')?.addEventListener('click', () => this.syncToCloudStorage(true));

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentFile(true);
      } else if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentFile(false);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.openFile();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const newDoc = this.docManager.addDocument();
        this.renderTabs();
        this.switchTab(newDoc.id);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        this.closeTab(this.docManager.activeDocId);
      }
    });
  }

  // =========================================================================
  // Native File System Access (Open / Save / Export)
  // =========================================================================
  async openFile() {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        const file = await handle.getFile();
        const content = await file.text();
        const newDoc = this.docManager.addDocument(file.name, 'markdown', content);
        newDoc.fileHandle = handle;
        this.switchTab(newDoc.id);
        this.showToast(`📂 Opened: ${file.name}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showOpenFilePicker error, falling back', err);
      }
    }
    document.getElementById('file-input')?.click();
  }

  async saveCurrentFile(saveAs = false) {
    const doc = this.docManager.getActiveDocument();
    const content = this.docManager.serializeDocument(doc);

    if ('showSaveFilePicker' in window) {
      try {
        let handle = doc.fileHandle;
        if (!handle || saveAs) {
          handle = await window.showSaveFilePicker({
            suggestedName: doc.title,
            types: [{
              description: 'Text & Markdown Files',
              accept: { 'text/plain': ['.txt', '.md', '.mmd'] }
            }]
          });
          doc.fileHandle = handle;
          doc.title = handle.name;
          this.renderTabs();
          const titleEl = document.getElementById('notebook-doc-title');
          if (titleEl) titleEl.textContent = handle.name;
        }

        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        this.docManager.markActiveSaved();
        this.renderTabs();
        this.showToast(`💾 Saved: ${doc.title}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Native save failed, fallback to download', err);
      }
    }

    this.downloadFile(doc.title, 'text/markdown;charset=utf-8', content);
    this.docManager.markActiveSaved();
    this.renderTabs();
    this.showToast(`📥 Downloaded: ${doc.title}`);
  }

  exportMarkdown() {
    const doc = this.docManager.getActiveDocument();
    const md = this.docManager.serializeDocument(doc);
    const filename = doc.title.replace(/\.[^/.]+$/, '') + '.md';
    this.downloadFile(filename, 'text/markdown;charset=utf-8', md);
    this.showToast(`📝 Exported Markdown: ${filename}`);
  }

  exportHTML() {
    const doc = this.docManager.getActiveDocument();
    const sections = doc.sections || [];
    let htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this.escapeHtml(doc.title)}</title>
      <style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #24292f; } pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }</style>
      <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script><script>mermaid.initialize({startOnLoad:true});</script>
      </head><body><h1>${this.escapeHtml(doc.title)}</h1>`;

    for (const s of sections) {
      if (s.type === 'diagram') {
        htmlContent += `<h3>${this.escapeHtml(s.title || 'Diagram')}</h3><div class="mermaid">${this.escapeHtml(s.content)}</div>`;
      } else {
        htmlContent += marked.parse(s.content || '');
      }
    }
    htmlContent += `</body></html>`;

    const filename = doc.title.replace(/\.[^/.]+$/, '') + '.html';
    this.downloadFile(filename, 'text/html;charset=utf-8', htmlContent);
    this.showToast(`🌐 Exported HTML: ${filename}`);
  }

  downloadFile(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Theme & Status Metrics
  // =========================================================================
  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${this.currentTheme}`;
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.textContent = this.currentTheme === 'dark' ? '🌙' : '☀️';
    if (this.monacoInstance) {
      monaco.editor.setTheme(this.currentTheme === 'dark' ? 'vs-dark' : 'vs');
    }
    mermaid.initialize({ theme: this.currentTheme === 'dark' ? 'dark' : 'default' });
    this.renderNotebook();
    this.updateStudioDiagramPreview();
  }

  triggerAutoSave() {
    if (!this.isAutoSaveEnabled) return;
    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
      indicator.textContent = '● Saving...';
      indicator.className = 'autosave-badge unsaved';
    }

    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.docManager.markActiveSaved();
      if (indicator) {
        indicator.textContent = '● Saved';
        indicator.className = 'autosave-badge saved';
      }
      this.renderTabs();
      if (this.googleUser) this.syncToCloudStorage();
    }, 600);
  }

  updateStatusMetrics() {
    const activeDoc = this.docManager.getActiveDocument();
    if (!activeDoc) return;

    const sections = activeDoc.sections || [];
    const secCountEl = document.getElementById('status-sections');
    if (secCountEl) secCountEl.textContent = `Sections: ${sections.length}`;

    const serialized = this.docManager.serializeDocument(activeDoc);
    const lengthEl = document.getElementById('status-length');
    if (lengthEl) lengthEl.textContent = `Length: ${serialized.length.toLocaleString()}`;

    const sizeEl = document.getElementById('status-filesize');
    if (sizeEl) {
      const bytes = new Blob([serialized]).size;
      sizeEl.textContent = `${bytes.toLocaleString()} bytes`;
    }
  }

  // Google Sync Helpers
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
    this.googleUser = {
      name: 'Anand',
      email: 'anand@gmail.com',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Anand'
    };
    localStorage.setItem('npp_google_user', JSON.stringify(this.googleUser));
    this.updateGoogleUI();
    this.syncToCloudStorage(true);
    document.getElementById('modal-cloud-sync')?.classList.add('hidden');
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
      if (authText) authText.textContent = this.googleUser.name;
      if (avatar) {
        avatar.src = this.googleUser.avatar;
        avatar.classList.remove('hidden');
      }
      if (syncStatusText) syncStatusText.textContent = `Cloud (${this.googleUser.email})`;
      signedOutView?.classList.add('hidden');
      signedInView?.classList.remove('hidden');
      document.getElementById('profile-name').textContent = this.googleUser.name;
      document.getElementById('profile-email').textContent = this.googleUser.email;
      document.getElementById('profile-img').src = this.googleUser.avatar;
    } else {
      if (authText) authText.textContent = 'Sign in with Google';
      avatar?.classList.add('hidden');
      if (syncStatusText) syncStatusText.textContent = 'Local Storage';
      signedOutView?.classList.remove('hidden');
      signedInView?.classList.add('hidden');
    }
  }

  syncToCloudStorage(showAlert = false) {
    const payload = {
      user: this.googleUser?.email,
      timestamp: new Date().toISOString(),
      documents: this.docManager.documents
    };
    localStorage.setItem('npp_cloud_backup', JSON.stringify(payload));
    if (showAlert) {
      this.showToast(`☁️ All tabs synced for ${this.googleUser?.email}`);
    }
  }

  showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  new NotepadApp();
});
