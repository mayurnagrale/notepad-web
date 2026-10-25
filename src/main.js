import { DocumentManager, DEFAULT_NOTE_CONTENT } from './documentManager.js';
import { WhiteboardCanvas } from './canvas.js';

// Fast, built-in Markdown renderer (zero external dependency)
function renderMarkdown(md) {
  if (!md || !md.trim()) return '<p style="color: var(--text-muted); font-style: italic;">Click to type note...</p>';
  let text = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  text = text.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  // Bold & Italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Checklists
  text = text.replace(/^- \[x\] (.*$)/gim, '<div style="color: var(--accent-green);">☑ $1</div>');
  text = text.replace(/^- \[ \] (.*$)/gim, '<div>☐ $1</div>');
  // Unordered lists
  text = text.replace(/^- (.*$)/gim, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
  // Blockquotes
  text = text.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
  // Paragraphs & breaks
  text = text.replace(/\n\n+/g, '</p><p>');
  text = `<p>${text.replace(/\n/g, '<br>')}</p>`;
  return text.replace(/<p><\/p>/g, '');
}

class NotepadApp {
  constructor() {
    this.docManager = new DocumentManager();
    this.currentTheme = 'dark';
    this.activeDiagramSecId = null;
    this.autoSaveTimer = null;
    this.editingSectionId = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderTabs();
    this.renderNotebook();
    this.updateStatusMetrics();
  }

  // =========================================================================
  // Document Tabs Management (Flush, Seamless Tabs)
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
    this.renderNotebook();
    this.updateStatusMetrics();
  }

  closeTab(docId) {
    this.docManager.closeDocument(docId);
    this.renderTabs();
    this.renderNotebook();
    this.updateStatusMetrics();
  }

  // =========================================================================
  // Seamless Notepad Rendering (Notes & Diagram Cards)
  // =========================================================================
  renderNotebook() {
    const activeDoc = this.docManager.getActiveDocument();
    const titleEl = document.getElementById('notebook-doc-title');
    const container = document.getElementById('sections-container');

    if (!container || !activeDoc) return;

    if (titleEl && document.activeElement !== titleEl) {
      titleEl.textContent = activeDoc.title;
    }

    container.innerHTML = '';

    const sections = activeDoc.sections || [];
    sections.forEach((sec, index) => {
      // Subtle insert divider between sections
      const dividerTop = this.createInsertDivider(index);
      container.appendChild(dividerTop);

      // Section Card
      const card = this.createSectionCard(sec, index);
      container.appendChild(card);
    });

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
        <button class="btn-divider-add" data-action="add-note">+ Note</button>
        <button class="btn-divider-add" data-action="add-diagram">+ Diagram</button>
      </div>
    `;

    div.querySelector('[data-action="add-note"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.docManager.addSection('note', { content: '' }, insertIndex);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    div.querySelector('[data-action="add-diagram"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.docManager.addSection('diagram', {}, insertIndex);
      this.renderNotebook();
      this.triggerAutoSave();
    });

    return div;
  }

  createSectionCard(sec, index) {
    const card = document.createElement('div');
    card.className = `notebook-section ${sec.type === 'diagram' ? 'diagram-section' : 'note-section'}`;
    card.dataset.id = sec.id;

    const isDiagram = sec.type === 'diagram';

    // Compact Header (appears subtly on hover)
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <span class="section-drag-handle" title="Reorder section">⠿</span>
      <span class="section-badge">${isDiagram ? '📊 Diagram' : '📝 Note'}</span>
      <div class="section-actions">
        <button class="btn-section-action" data-action="move-up" title="Move Up">⬆️</button>
        <button class="btn-section-action" data-action="move-down" title="Move Down">⬇️</button>
        <button class="btn-section-action danger" data-action="delete" title="Delete">🗑️</button>
      </div>
    `;

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

    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'section-body';

    if (isDiagram) {
      // Diagram Section: Supports pasting image, uploading image/svg, or whiteboard canvas!
      body.appendChild(this.createDiagramCardBody(sec));
    } else {
      // Note Section: Seamless typing like Notepad
      body.appendChild(this.createNoteBody(sec, card));
    }

    card.appendChild(body);
    return card;
  }

  createNoteBody(sec, card) {
    const wrapper = document.createElement('div');
    const isEditing = this.editingSectionId === sec.id;

    const previewDiv = document.createElement('div');
    previewDiv.className = `note-preview ${isEditing ? 'hidden' : ''}`;

    if (!sec.content || !sec.content.trim()) {
      previewDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">Click to type note...</p>`;
    } else {
      try {
        previewDiv.innerHTML = renderMarkdown(sec.content);
      } catch {
        previewDiv.textContent = sec.content;
      }
    }

    const textarea = document.createElement('textarea');
    textarea.className = `note-textarea ${isEditing ? '' : 'hidden'}`;
    textarea.placeholder = 'Type your notes here...';
    textarea.value = sec.content || '';

    const autoResize = (el) => {
      el.style.height = 'auto';
      el.style.height = Math.max(48, el.scrollHeight) + 'px';
    };

    previewDiv.addEventListener('click', () => {
      this.editingSectionId = sec.id;
      previewDiv.classList.add('hidden');
      textarea.classList.remove('hidden');
      autoResize(textarea);
      textarea.focus();
      card.classList.add('active-focus');
    });

    textarea.addEventListener('input', () => {
      autoResize(textarea);
      this.docManager.updateSection(sec.id, { content: textarea.value });
      this.triggerAutoSave();
    });

    textarea.addEventListener('blur', () => {
      this.editingSectionId = null;
      textarea.classList.add('hidden');
      previewDiv.classList.remove('hidden');
      card.classList.remove('active-focus');
      try {
        previewDiv.innerHTML = sec.content && sec.content.trim()
          ? renderMarkdown(sec.content)
          : `<p style="color: var(--text-muted); font-style: italic;">Click to type note...</p>`;
      } catch {
        previewDiv.textContent = sec.content;
      }
    });

    wrapper.appendChild(previewDiv);
    wrapper.appendChild(textarea);
    if (isEditing) {
      setTimeout(() => autoResize(textarea), 0);
    }
    return wrapper;
  }

  createDiagramCardBody(sec) {
    const card = document.createElement('div');
    card.className = 'diagram-card';

    if (sec.imageSrc) {
      // Image already attached (pasted or uploaded diagram)
      const container = document.createElement('div');
      container.className = 'diagram-image-container';

      const img = document.createElement('img');
      img.src = sec.imageSrc;
      img.className = 'diagram-image-preview';
      img.alt = 'Diagram';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const btnReplace = document.createElement('button');
      btnReplace.className = 'btn-sm';
      btnReplace.textContent = '🔄 Replace';
      btnReplace.addEventListener('click', () => {
        this.activeDiagramSecId = sec.id;
        document.getElementById('diagram-image-input')?.click();
      });

      const btnDownload = document.createElement('button');
      btnDownload.className = 'btn-sm';
      btnDownload.textContent = '📥 Download';
      btnDownload.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `diagram-${Date.now()}.png`;
        link.href = sec.imageSrc;
        link.click();
      });

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-sm';
      btnRemove.textContent = '🗑️ Remove Image';
      btnRemove.addEventListener('click', () => {
        this.docManager.updateSection(sec.id, { imageSrc: null, diagramMode: 'image' });
        this.renderNotebook();
        this.triggerAutoSave();
      });

      actions.appendChild(btnReplace);
      actions.appendChild(btnDownload);
      actions.appendChild(btnRemove);

      container.appendChild(img);
      container.appendChild(actions);
      card.appendChild(container);

    } else if (sec.diagramMode === 'canvas') {
      // Canvas Drawing Mode
      const wrapper = document.createElement('div');
      wrapper.className = 'diagram-canvas-wrapper';

      const toolbar = document.createElement('div');
      toolbar.className = 'diagram-canvas-toolbar';
      toolbar.innerHTML = `
        <button data-tool="rect">▭ Rect</button>
        <button data-tool="circle">◯ Circle</button>
        <button data-tool="arrow">➔ Arrow</button>
        <button data-tool="freehand">✏️ Draw</button>
        <button data-tool="clear" style="margin-left: auto;">🗑️ Clear</button>
        <button data-tool="done" style="color: var(--accent-green); font-weight: 600;">✓ Done</button>
      `;

      const canvas = document.createElement('canvas');
      canvas.className = 'diagram-canvas-element';

      wrapper.appendChild(toolbar);
      wrapper.appendChild(canvas);
      card.appendChild(wrapper);

      setTimeout(() => {
        const wb = new WhiteboardCanvas(canvas);
        if (sec.canvasData) {
          wb.shapes = sec.canvasData;
          wb.render();
        }

        toolbar.querySelectorAll('[data-tool]').forEach(b => {
          b.addEventListener('click', () => {
            const tool = b.dataset.tool;
            if (tool === 'clear') {
              wb.clear();
            } else if (tool === 'done') {
              const dataUrl = canvas.toDataURL('image/png');
              this.docManager.updateSection(sec.id, { imageSrc: dataUrl, canvasData: wb.shapes });
              this.renderNotebook();
              this.triggerAutoSave();
            } else {
              wb.currentTool = tool;
            }
          });
        });
      }, 30);

    } else {
      // Empty Diagram Dropzone: Click to browse, Paste (Ctrl+V) from clipboard, or Draw!
      const dropzone = document.createElement('div');
      dropzone.className = 'diagram-dropzone';
      dropzone.innerHTML = `
        <div class="dropzone-icon">📊</div>
        <div class="dropzone-title">Paste or Upload Diagram</div>
        <div class="dropzone-sub">Press <strong>Ctrl+V</strong> to paste diagram from clipboard, click to upload image, or draw on canvas</div>
        <div style="margin-top: 10px; display: flex; justify-content: center; gap: 8px;">
          <button class="btn-sm btn-browse-diagram">📁 Upload Image</button>
          <button class="btn-sm btn-draw-diagram">🎨 Draw on Canvas</button>
        </div>
      `;

      dropzone.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-draw-diagram')) {
          e.stopPropagation();
          this.docManager.updateSection(sec.id, { diagramMode: 'canvas' });
          this.renderNotebook();
          return;
        }
        this.activeDiagramSecId = sec.id;
        document.getElementById('diagram-image-input')?.click();
      });

      // Drag and drop image file into dropzone
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-active');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          this.loadDiagramImage(file, sec.id);
        }
      });

      card.appendChild(dropzone);
    }

    return card;
  }

  loadDiagramImage(file, sectionId) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.docManager.updateSection(sectionId, {
        imageSrc: e.target.result,
        diagramMode: 'image'
      });
      this.renderNotebook();
      this.triggerAutoSave();
      this.showToast('📊 Diagram image added!');
    };
    reader.readAsDataURL(file);
  }

  // =========================================================================
  // UI Event Bindings
  // =========================================================================
  bindEvents() {
    // Activity Bar Buttons
    document.getElementById('act-add-note')?.addEventListener('click', () => {
      this.docManager.addSection('note');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('act-add-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('act-open')?.addEventListener('click', () => this.openFile());
    document.getElementById('act-save')?.addEventListener('click', () => this.saveCurrentFile(false));
    document.getElementById('act-theme')?.addEventListener('click', () => this.toggleTheme());

    const findPanel = document.getElementById('find-replace-panel');
    document.getElementById('act-find')?.addEventListener('click', () => {
      findPanel?.classList.toggle('hidden');
      if (findPanel && !findPanel.classList.contains('hidden')) {
        document.getElementById('find-input')?.focus();
      }
    });

    // Menus
    document.getElementById('menu-open-file')?.addEventListener('click', () => this.openFile());
    document.getElementById('menu-save-file')?.addEventListener('click', () => this.saveCurrentFile(false));
    document.getElementById('menu-save-as')?.addEventListener('click', () => this.saveCurrentFile(true));
    document.getElementById('menu-close-tab')?.addEventListener('click', () => this.closeTab(this.docManager.activeDocId));
    document.getElementById('menu-export-markdown')?.addEventListener('click', () => this.exportMarkdown());
    document.getElementById('menu-insert-note')?.addEventListener('click', () => {
      this.docManager.addSection('note');
      this.renderNotebook();
      this.triggerAutoSave();
    });
    document.getElementById('menu-insert-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    // Tab Bar New Tab Button (+)
    document.getElementById('btn-add-tab')?.addEventListener('click', () => {
      const newDoc = this.docManager.addDocument();
      this.renderTabs();
      this.switchTab(newDoc.id);
    });

    // Bottom Add Buttons
    document.getElementById('btn-bottom-add-note')?.addEventListener('click', () => {
      this.docManager.addSection('note');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    document.getElementById('btn-bottom-add-diagram')?.addEventListener('click', () => {
      this.docManager.addSection('diagram');
      this.renderNotebook();
      this.triggerAutoSave();
    });

    // Diagram file input
    const diagramInput = document.getElementById('diagram-image-input');
    diagramInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.activeDiagramSecId) {
        this.loadDiagramImage(file, this.activeDiagramSecId);
        diagramInput.value = '';
      }
    });

    // Global Clipboard Paste (Ctrl+V) for Diagrams/Images!
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const activeDoc = this.docManager.getActiveDocument();
            // Find first empty diagram section or add new one
            let targetSec = (activeDoc.sections || []).find(s => s.type === 'diagram' && !s.imageSrc);
            if (!targetSec) {
              targetSec = this.docManager.addSection('diagram');
            }
            this.loadDiagramImage(file, targetSec.id);
            break;
          }
        }
      }
    });

    // Editable doc title
    const docTitleEl = document.getElementById('notebook-doc-title');
    docTitleEl?.addEventListener('blur', () => {
      const activeDoc = this.docManager.getActiveDocument();
      if (activeDoc) {
        activeDoc.title = docTitleEl.textContent.trim() || 'Notes 1';
        this.docManager.saveSession();
        this.renderTabs();
      }
    });

    // Find panel buttons
    document.getElementById('btn-close-find')?.addEventListener('click', () => {
      findPanel?.classList.add('hidden');
    });

    // Theme toggle
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.toggleTheme());

    // Cloud modal
    const syncModal = document.getElementById('modal-cloud-sync');
    document.getElementById('btn-google-auth')?.addEventListener('click', () => syncModal?.classList.remove('hidden'));
    document.getElementById('btn-close-modal')?.addEventListener('click', () => syncModal?.classList.add('hidden'));
    document.getElementById('btn-sync-now')?.addEventListener('click', () => {
      this.docManager.saveSession();
      this.showToast('☁️ Notes backed up to local storage!');
    });

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

    // File input fallback
    document.getElementById('file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const newDoc = this.docManager.addDocument(file.name, event.target.result);
          this.switchTab(newDoc.id);
          this.showToast(`📂 Opened: ${file.name}`);
        };
        reader.readAsText(file);
      }
    });
  }

  // =========================================================================
  // File Operations (Save / Open / Export)
  // =========================================================================
  async openFile() {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        const file = await handle.getFile();
        const content = await file.text();
        const newDoc = this.docManager.addDocument(file.name, content);
        newDoc.fileHandle = handle;
        this.switchTab(newDoc.id);
        this.showToast(`📂 Opened: ${file.name}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
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
            suggestedName: `${doc.title}.md`,
            types: [{
              description: 'Markdown File',
              accept: { 'text/markdown': ['.md', '.txt'] }
            }]
          });
          doc.fileHandle = handle;
          doc.title = handle.name;
          this.renderTabs();
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
      }
    }

    this.downloadFile(`${doc.title}.md`, 'text/markdown;charset=utf-8', content);
    this.docManager.markActiveSaved();
    this.renderTabs();
    this.showToast(`📥 Downloaded: ${doc.title}`);
  }

  exportMarkdown() {
    const doc = this.docManager.getActiveDocument();
    const md = this.docManager.serializeDocument(doc);
    this.downloadFile(`${doc.title}.md`, 'text/markdown;charset=utf-8', md);
    this.showToast(`📝 Exported: ${doc.title}.md`);
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

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${this.currentTheme}`;
    const icon = document.querySelector('.theme-icon');
    if (icon) icon.textContent = this.currentTheme === 'dark' ? '🌙' : '☀️';
  }

  triggerAutoSave() {
    const indicator = document.getElementById('autosave-indicator');
    if (indicator) {
      indicator.textContent = '● Saving...';
      indicator.style.color = 'var(--accent-rose)';
    }

    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.docManager.markActiveSaved();
      if (indicator) {
        indicator.textContent = '● Saved';
        indicator.style.color = 'var(--accent-green)';
      }
      this.renderTabs();
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
    if (lengthEl) lengthEl.textContent = `Length: ${serialized.length.toLocaleString()} chars`;
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
      setTimeout(() => toast.remove(), 250);
    }, 2200);
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
