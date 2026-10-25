/**
 * Document & Tab Manager - Manages tabs, seamless notes, and image/canvas diagrams
 */

export const DEFAULT_NOTE_CONTENT = `# Notes

Start typing your notes here...
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
      const savedDocs = localStorage.getItem('npp_documents_v3');
      const activeId = localStorage.getItem('npp_active_doc_id_v3');
      if (savedDocs) {
        this.documents = JSON.parse(savedDocs);
        this.activeDocId = activeId || (this.documents[0] ? this.documents[0].id : null);
      }
    } catch (e) {
      console.warn('Could not load session from localStorage', e);
    }

    // Migration from v2/v1 if v3 is not found
    if (!this.documents || this.documents.length === 0) {
      try {
        const v2Docs = localStorage.getItem('npp_documents_v2') || localStorage.getItem('npp_documents');
        if (v2Docs) {
          const parsed = JSON.parse(v2Docs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.documents = parsed.map(d => this.migrateDoc(d));
            this.activeDocId = this.documents[0].id;
          }
        }
      } catch (e) {
        console.warn('Could not migrate previous session', e);
      }
    }

    // Default fresh start: clean, simple Notepad
    if (!this.documents || this.documents.length === 0) {
      this.documents = [
        {
          id: `doc-${Date.now()}`,
          title: 'Notes 1',
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
    let sections = [];
    if (doc.sections && Array.isArray(doc.sections) && doc.sections.length > 0) {
      sections = doc.sections.map(s => {
        if (s.type === 'diagram') {
          return {
            id: s.id || `sec-${Date.now()}`,
            type: 'diagram',
            title: s.title || 'Diagram',
            diagramMode: s.imageSrc ? 'image' : 'canvas',
            imageSrc: s.imageSrc || null,
            canvasData: s.canvasData || null
          };
        }
        return {
          id: s.id || `sec-${Date.now()}`,
          type: 'note',
          title: s.title || 'Notes',
          content: s.content || ''
        };
      });
    } else {
      sections = [
        {
          id: `sec-${Date.now()}-1`,
          type: 'note',
          title: 'Notes',
          content: doc.content || DEFAULT_NOTE_CONTENT
        }
      ];
    }

    return {
      id: doc.id || `doc-${Date.now()}`,
      title: doc.title || 'Notes 1',
      sections: sections,
      isDirty: false
    };
  }

  saveSession() {
    try {
      localStorage.setItem('npp_documents_v3', JSON.stringify(this.documents));
      if (this.activeDocId) {
        localStorage.setItem('npp_active_doc_id_v3', this.activeDocId);
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

  addDocument(title = null, initialContent = null) {
    const count = this.documents.length + 1;
    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: title || `Notes ${count}`,
      sections: [
        {
          id: `sec-${Date.now()}-1`,
          type: 'note',
          title: 'Notes',
          content: initialContent || DEFAULT_NOTE_CONTENT
        }
      ],
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
      this.documents[0] = {
        id: `doc-${Date.now()}`,
        title: 'Notes 1',
        sections: [
          {
            id: `sec-${Date.now()}-1`,
            type: 'note',
            title: 'Notes',
            content: DEFAULT_NOTE_CONTENT
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

  // --- Section Operations ---

  addSection(type = 'note', data = {}, atIndex = -1) {
    const doc = this.getActiveDocument();
    if (!doc) return null;
    if (!doc.sections) doc.sections = [];

    const newSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type, // 'note' or 'diagram'
      title: data.title || (type === 'diagram' ? 'Diagram' : 'Notes'),
      content: data.content || '',
      diagramMode: data.diagramMode || 'image', // 'image' or 'canvas'
      imageSrc: data.imageSrc || null,
      canvasData: data.canvasData || null
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

  updateSection(sectionId, updates = {}) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    const sec = doc.sections.find(s => s.id === sectionId);
    if (sec) {
      Object.assign(sec, updates);
      doc.isDirty = true;
      this.saveSession();
      this.notifyTabChange();
    }
  }

  deleteSection(sectionId) {
    const doc = this.getActiveDocument();
    if (!doc || !doc.sections) return;

    if (doc.sections.length <= 1) {
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

  serializeDocument(doc = null) {
    const targetDoc = doc || this.getActiveDocument();
    if (!targetDoc || !targetDoc.sections) return '';

    return targetDoc.sections.map(s => {
      if (s.type === 'diagram') {
        if (s.imageSrc) {
          return `![${s.title || 'Diagram'}](${s.imageSrc})`;
        }
        return `[Diagram: ${s.title || 'Canvas Diagram'}]`;
      }
      return s.content || '';
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
