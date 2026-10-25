/**
 * Diagram Templates for quick insertion into editor
 */

export const DIAGRAM_TEMPLATES = {
  flowchart: `graph TD
    Start([🚀 Start Process]) --> Check{Is User Logged In?}
    Check -->|Yes| Dashboard[📊 Display Dashboard]
    Check -->|No| Login[🔑 Redirect to Google Sign-in]
    Login --> Verify{Credentials Valid?}
    Verify -->|Success| Sync[☁️ Sync Cloud Notes]
    Verify -->|Failed| Retry[⚠️ Show Error Message]
    Retry --> Login
    Sync --> Dashboard
    Dashboard --> End([🏁 Ready to Edit])
    
    style Start fill:#10b981,stroke:#fff,color:#000
    style Check fill:#f59e0b,stroke:#fff,color:#000
    style Dashboard fill:#06b6d4,stroke:#fff,color:#000
    style End fill:#8b5cf6,stroke:#fff,color:#fff
`,

  sequence: `sequenceDiagram
    autonumber
    actor User as 👤 User (macOS/Win)
    participant Client as 💻 Notepad++ Web
    participant Google as 🔑 Google OAuth
    participant Cloud as ☁️ Cloud Sync Storage

    User->>Client: Open in Browser / PWA
    Client->>Client: Load Local Tabs from IndexedDB
    User->>Client: Click "Sign in with Google"
    Client->>Google: Authenticate User Token
    Google-->>Client: Return Profile & JWT
    Client->>Cloud: Request Synced Documents
    Cloud-->>Client: Merge Cloud Tabs with Local Changes
    Client-->>User: Display Synced Workspace
`,

  architecture: `graph LR
    subgraph Clients ["Cross-Platform Devices"]
        Mac["🍏 macOS (Safari / Chrome PWA)"]
        Win["🪟 Windows (Edge / Chrome)"]
        Mobile["📱 iPad / Mobile"]
    end

    subgraph AppCore ["Notepad++ Web Engine"]
        Tabs["Tabs Manager"]
        Monaco["Monaco Editor Core"]
        MermaidEngine["Mermaid Diagram Renderer"]
        CanvasEngine["Vector Whiteboard"]
    end

    subgraph CloudLayer ["Google Cloud Sync"]
        OAuth["Google Identity (OAuth2)"]
        Drive["Google Drive / Cloud Storage"]
    end

    Mac --> AppCore
    Win --> AppCore
    Mobile --> AppCore

    AppCore <--> OAuth
    AppCore <--> Drive

    style Mac fill:#1e293b,stroke:#06b6d4,color:#fff
    style Win fill:#1e293b,stroke:#3b82f6,color:#fff
    style AppCore fill:#181825,stroke:#10b981,color:#fff
    style CloudLayer fill:#1e1e2e,stroke:#f59e0b,color:#fff
`,

  classDiagram: `classDiagram
    class Document {
        +String id
        +String title
        +String content
        +String language
        +Boolean isDirty
        +save()
        +export()
    }

    class DiagramViewer {
        +renderMermaid(code)
        +exportSVG()
        +exportPNG()
        +zoom(scale)
    }

    class WhiteboardCanvas {
        +Array shapes
        +drawShape(shape)
        +undo()
        +clear()
    }

    class CloudSyncService {
        +User currentUser
        +loginWithGoogle()
        +syncDocuments()
        +saveBackup()
    }

    Document <|-- DiagramViewer
    Document <|-- WhiteboardCanvas
    Document --> CloudSyncService
`,

  er: `erDiagram
    USER ||--o{ DOCUMENT : owns
    USER ||--o{ DIAGRAM : creates
    DOCUMENT ||--o{ TAB_SESSION : contains

    USER {
        string google_id PK
        string email
        string display_name
        timestamp last_login
    }

    DOCUMENT {
        string id PK
        string title
        string content
        string language
        timestamp updated_at
    }

    DIAGRAM {
        string id PK
        string diagram_type
        json canvas_data
    }
`,

  mindmap: `mindmap
  root((Notepad++ Cloud))
    Code Editor
      Monaco Engine
      Multi-Language Syntax
      Find and Replace
      Keyboard Shortcuts
    Diagramming
      Live Mermaid Engine
        Flowcharts
        Sequence Diagrams
        Architecture Charts
      Visual Canvas Whiteboard
        Shapes & Connectors
        Freehand Drawing
        PNG Export
    Cloud & Platform
      Google Account Sync
      Cross-Platform
        macOS PWA
        Windows
        Linux / iPad
      Autosave Session
`
};
