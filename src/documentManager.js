/**
 * Document & Tab Manager - Manages documents, Jupyter-style sections, and persistence
 */

export const DEFAULT_NOTE_CONTENT = `# Quick Notes 📝

Start typing your notes here. 

You can:
- Write formatted notes with **bold**, *italics*, bullet points, and code
- Click **+ Note** or **+ Diagram** to add sections (like Jupyter Notebook)
- Open **Diagram Studio** to design flowcharts, architecture diagrams, or whiteboard sketches, and drag them right into your notes!
`;

export const DEFAULT_DIAGRAM_TEMPLATE = `graph TD
    Start([🚀 Start Project]) --> Plan[📋 Outline Architecture]
    Plan --> Build[💻 Code & Build]
    Build --> Test{Pass All Tests?}
    Test -->|No| Fix[🐛 Debug & Fix]
    Fix --> Build
    Test -->|Yes| Deploy([🎉 Ship to Production])
    
    style Start fill:#10b981,stroke:#fff,color:#000
    style Build fill:#06b6d4,stroke:#fff,color:#000
    style Deploy fill:#8b5cf6,stroke:#fff,color:#fff
`;

export class DocumentManager {
  constructor() {
    this.documents = [];
    this.activeDocId = null;
    this.listeners = [];
    this.loadSession();
  }

  loadSession() {
    try {
      const savedDocs = localStorage.getItem('npp_documents_v2');
      const activeId = localStorage.getItem('npp_active_doc_id_v2');
      if (savedDocs) {
        this.documents = JSON.parse(savedDocs);
        this.activeDocId = activeId || (this.documents[0] ? this.documents[0].id : null);
      }
    } catch (e) {
      console.warn('Could not load session from localStorage', e);
    }

    // Fallback: check v1 storage and migrate
    if (!this.documents || this.documents.length === 0) {
      try {
        const v1Docs = localStorage.getItem('npp_documents');
        if (v1Docs) {
          const parsed = JSON.parse(v1Docs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.documents = parsed.map(d => this.migrateDoc(d));
            this.activeDocId = this.documents[0].id;
          }
        }
      } catch (e) {
        console.warn('Could not migrate v1 session', e);
      }
    }

    // Default fresh start: clean Notepad document
    if (!this.documents || this.documents.length === 0) {
      this.documents = [
        {
          id: `doc-${Date.now()}`,
          title: 'new 1.txt',
          language: 'markdown',
          sections: [
            {
              id: `sec-${Date.now()}-1`,
              type: 'note',
              title: 'Notes',
              content: DEFAULT_NOTE_CONTENT
            }
          ],
          isDirty: false
        }
      ];
      this.activeDocId = this.documents[0].id;
      this.saveSession();
    }
  }

  migrateDoc(doc) {
    if (doc.sections && Array.isArray(doc.sections) && doc.sections.length > 0) {
      return doc;
    }
    const sections = this.parseContentIntoSections(doc.content || '', doc.language);
    return {
      id: doc.id || `doc-${Date.now()}`,
      title: doc.title || 'new 1.txt',
      language: doc.language || 'markdown',
      sections: sections.length > 0 ? sections : [
        {
          id: `sec-${Date.now()}-1`,
          type: 'note',
          title: 'Notes',
          content: doc.content || DEFAULT_NOTE_CONTENT
        }
      ],
      isDirty: false
    };
  }

  parseContentIntoSections(text, language = 'markdown') {
    if (!text || typeof text !== 'string') return [];
    
    // Check if whole text is mermaid
    const trimmed = text.trim();
    if (language === 'mermaid' || trimmed.startsWith('graph ') || trimmed.startsWith('sequenceDiagram') || trimmed.startsWith('classDiagram') || trimmed.startsWith('erDiagram') || trimmed.startsWith('mindmap')) {
      return [{
        id: `sec-${Date.now()}-dia`,
        type: 'diagram',
        title: 'Diagram',
        content: text
      }];
    }

    // Parse markdown with ```mermaid blocks
    const sections = [];
    const mermaidRegex = /```mermaid\s*([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = mermaidRegex.exec(text)) !== null) {
      const textBefore = text.substring(lastIndex, match.index).trim();
      if (textBefore) {
        sections.push({
          id: `sec-${Date.now()}-${sections.length}`,
          type: 'note',
          title: 'Notes',
          content: textBefore
        });
      }
      sections.push({
        id: `sec-${Date.now()}-${sections.length}`,
        type: 'diagram',
        title: 'Diagram',
        content: match[1].trim()
      });
      lastIndex = match.index + match[0].length;
    }

    const remaining = text.substring(lastIndex).trim();
    if (remaining || sections.length === 0) {
      sections.push({
        id: `sec-${Date.now()}-${sections.length}`,
        type: 'note',
        title: 'Notes',
        content: remaining || text
      });
    }

    return sections;
  }

  saveSession() {
    try {
      localStorage.setItem('npp_documents_v2', JSON.stringify(this.documents));
      if (this.activeDocId) {
        localStorage.setItem('npp_active_doc_id_v2', this.activeDocId);
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

  addDocument(title = null, language = 'markdown', initialContent = null) {
    const count = this.documents.length + 1;
    let sections;
    if (initialContent) {
      sections = this.parseContentIntoSections(initialContent, language);
    } else {
      sections = [
        {
          id: `sec-${Date.now()}-1`,
          type: 'note',
          title: 'Notes',
          content: ''
        }
      ];
    }

    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: title || `new ${count}.txt`,
      language: language,
      sections: sections,
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
      // Don't close last document, reset it to clean
      this.documents[0] = {
        id: `doc-${Date.now()}`,
        title: 'new 1.txt',
        language: 'markdown',
        sections: [
          {
            id: `sec-${Date.now()}-1`,
            type: 'note',
            title: 'Notes',
            content: ''
          }
        ],
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

  // --- Section Operations (Jupyter Notebook-style) ---

  addSection(type = 'note', content = '', title = '', atIndex = -1) {
    const doc = this.getActiveDocument();
    if (!doc) return null;
    if (!doc.sections) doc.sections = [];

    const newSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type, // 'note' or 'diagram'
      title: title || (type === 'diagram' ? 'Diagram' : 'Notes'),
      content: content || (type === 'diagram' ? DEFAULT_DIAGRAM_TEMPLATE : '')
    };

    if (atIndex >= 0 && atIndex <= doc.sections.length) {
      doc.sections.splice(atIndex, 0, newSection);
    } else {
      doc.sections.push(newSection);
    }

    doc.isDirty = true;
    this.saveSession();
    this.notify();
    return newSection;
  }

  updateSection(sectionId, content, title = null) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    const sec = doc.sections.find(s => s.id === sectionId);
    if (sec) {
      let changed = false;
      if (content !== undefined && sec.content !== content) {
        sec.content = content;
        changed = true;
      }
      if (title !== null && sec.title !== title) {
        sec.title = title;
        changed = true;
      }
      if (changed) {
        doc.isDirty = true;
        this.saveSession();
        this.notifyTabChange();
      }
    }
  }

  deleteSection(sectionId) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    if (doc.sections.length <= 1) {
      // Keep at least one empty note section
      doc.sections[0] = {
        id: `sec-${Date.now()}`,
        type: 'note',
        title: 'Notes',
        content: ''
      };
    } else {
      const index = doc.sections.findIndex(s => s.id === sectionId);
      if (index !== -1) {
        doc.sections.splice(index, 1);
      }
    }

    doc.isDirty = true;
    this.saveSession();
    this.notify();
  }

  moveSection(sectionId, direction) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    const index = doc.sections.findIndex(s => s.id === sectionId);
    if (index === -1) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= doc.sections.length) return;

    const [moved] = doc.sections.splice(index, 1);
    doc.sections.splice(targetIndex, 0, moved);

    doc.isDirty = true;
    this.saveSession();
    this.notify();
  }

  reorderSections(fromIndex, toIndex) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    if (fromIndex < 0 || fromIndex >= doc.sections.length || toIndex < 0 || toIndex >= doc.sections.length) {
      return;
    }

    const [moved] = doc.sections.splice(fromIndex, 1);
    doc.sections.splice(toIndex, 0, moved);

    doc.isDirty = true;
    this.saveSession();
    this.notify();
  }

  // Serialize all sections to a unified Markdown or raw text document
  serializeDocument(doc = null) {
    const targetDoc = doc || this.getActiveDocument();
    if (!targetDoc || !targetDoc.sections) return '';

    return targetDoc.sections.map(s => {
      if (s.type === 'diagram') {
        return `\`\`\`mermaid\n${s.content.trim()}\n\`\`\``;
      }
      return s.content;
    }).join('\n\n');
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
