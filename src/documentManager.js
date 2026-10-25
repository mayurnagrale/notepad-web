/**
 * Document & Tab Manager - Manages open tabs, content, autosave, and local sessions
 */

const DEFAULT_DOCUMENTS = [
  {
    id: 'doc-welcome',
    title: 'architecture.mmd',
    language: 'mermaid',
    content: `%% ==========================================
%% Notepad++ Cloud & Canvas - Architecture
%% ==========================================
graph TD
    User["👤 User (macOS, Windows, Browser)"]
    
    subgraph Frontend ["Notepad++ Web PWA"]
        Tabs["📑 Notepad++ Tab Manager"]
        Monaco["💻 Monaco Code Editor"]
        LiveMermaid["📊 Live Mermaid Engine"]
        Canvas["🎨 Vector Whiteboard Canvas"]
    end
    
    subgraph Storage ["Storage & Sync Layer"]
        Local["💾 LocalStorage / IndexedDB (Instant Offline)"]
        GoogleSync["☁️ Google Identity & Cloud Storage"]
    end
    
    User -->|Open in browser / PWA| Tabs
    Tabs --> Monaco
    Tabs --> LiveMermaid
    Tabs --> Canvas
    
    Monaco -->|Debounced Autosave| Local
    Local <-->|Cross-platform sync| GoogleSync
    
    style User fill:#06b6d4,stroke:#fff,color:#000
    style Monaco fill:#1e1e2e,stroke:#10b981,color:#cdd6f4
    style LiveMermaid fill:#1e1e2e,stroke:#8b5cf6,color:#cdd6f4
    style GoogleSync fill:#4285f4,stroke:#fff,color:#fff
`,
    isDirty: false
  },
  {
    id: 'doc-notes',
    title: 'quick-notes.md',
    language: 'markdown',
    content: `# Welcome to Notepad++ Cloud & Canvas 🚀

This is a modern, cross-platform reimagination of **Notepad++** designed for **macOS, Windows, and Web browsers**.

## ✨ Key Features:
- **Notepad++ Tab Bar**: Open, close, and switch between multiple documents effortlessly.
- **Autosave**: Never lose your changes; all edits are continuously auto-saved.
- **Diagramming Support**:
  - **Code Diagrams (Mermaid.js)**: Flowcharts, sequence diagrams, architecture charts with live rendering.
  - **Visual Whiteboard Canvas**: Interactive vector drawing canvas for shapes, arrows, and freehand sketches.
- **Google Account Sync**: Link with your Gmail/Google account to access your notes from any device.
- **PWA Ready**: On macOS, click **Install** in Chrome/Safari to add it to your Dock and Applications folder!

\`\`\`javascript
// Example code snippet:
function welcome() {
  console.log("Welcome to cross-platform Notepad++!");
}
welcome();
\`\`\`
`,
    isDirty: false
  }
];

export class DocumentManager {
  constructor() {
    this.documents = [];
    this.activeDocId = null;
    this.listeners = [];
    this.loadSession();
  }

  loadSession() {
    try {
      const savedDocs = localStorage.getItem('npp_documents');
      const activeId = localStorage.getItem('npp_active_doc_id');
      if (savedDocs) {
        this.documents = JSON.parse(savedDocs);
        this.activeDocId = activeId || (this.documents[0] ? this.documents[0].id : null);
      }
    } catch (e) {
      console.warn('Could not load session from localStorage', e);
    }

    if (!this.documents || this.documents.length === 0) {
      this.documents = JSON.parse(JSON.stringify(DEFAULT_DOCUMENTS));
      this.activeDocId = this.documents[0].id;
      this.saveSession();
    }
  }

  saveSession() {
    try {
      localStorage.setItem('npp_documents', JSON.stringify(this.documents));
      if (this.activeDocId) {
        localStorage.setItem('npp_active_doc_id', this.activeDocId);
      }
    } catch (e) {
      console.warn('Could not save session to localStorage', e);
    }
  }

  getActiveDocument() {
    return this.documents.find(doc => doc.id === this.activeDocId) || this.documents[0];
  }

  setActiveDocument(id) {
    if (this.documents.some(d => d.id === id)) {
      this.activeDocId = id;
      this.saveSession();
      this.notify();
    }
  }

  addDocument(title = null, language = 'plaintext', content = '') {
    const count = this.documents.length + 1;
    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: title || `new ${count}.txt`,
      language: language,
      content: content,
      isDirty: false
    };
    this.documents.push(newDoc);
    this.activeDocId = newDoc.id;
    this.saveSession();
    this.notify();
    return newDoc;
  }

  closeDocument(id) {
    if (this.documents.length <= 1) {
      // Don't close last document, reset it instead
      this.documents[0] = {
        id: `doc-${Date.now()}`,
        title: 'new 1.txt',
        language: 'plaintext',
        content: '',
        isDirty: false
      };
      this.activeDocId = this.documents[0].id;
    } else {
      const index = this.documents.findIndex(d => d.id === id);
      if (index !== -1) {
        this.documents.splice(index, 1);
        if (this.activeDocId === id) {
          const nextIndex = Math.min(index, this.documents.length - 1);
          this.activeDocId = this.documents[nextIndex].id;
        }
      }
    }
    this.saveSession();
    this.notify();
  }

  updateActiveContent(newContent) {
    const doc = this.getActiveDocument();
    if (doc && doc.content !== newContent) {
      doc.content = newContent;
      doc.isDirty = true;
      this.saveSession();
      // Notify without re-rendering the whole editor
      this.notifyTabChange();
    }
  }

  markActiveSaved() {
    const doc = this.getActiveDocument();
    if (doc) {
      doc.isDirty = false;
      this.saveSession();
      this.notifyTabChange();
    }
  }

  setLanguageForActive(language) {
    const doc = this.getActiveDocument();
    if (doc) {
      doc.language = language;
      this.saveSession();
      this.notify();
    }
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.getActiveDocument(), this.documents);
    }
  }

  notifyTabChange() {
    const event = new CustomEvent('document-tab-change', {
      detail: { activeDoc: this.getActiveDocument(), documents: this.documents }
    });
    window.dispatchEvent(event);
  }
}
