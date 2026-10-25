# 🦎 Notepad++ Notebook & Diagram Studio

A modern, cross-platform reimagining of **Notepad++** built for **macOS**, **Windows**, **Linux**, and **Web/Mobile**. 

Combines the speed, familiarity, and multi-tab workflow of Notepad++ with **Jupyter-style sections** for easy-to-use notes and diagrams, a dedicated **Diagram Studio** (Mermaid & Whiteboard Canvas), and seamless **drag-and-drop diagram insertion**.

---

## ✨ Features

- **📝 Clean Notepad First-Launch**: Opens by default as a clean, distraction-free, full-width notepad (`new 1.txt`) ready for typing—no confusing two-column split views or charts cluttering your screen on startup.
- **📓 Jupyter-Style Notebook Sections**:
  - **Note Sections**: Write notes with rich Markdown rendering (bold, italics, lists, checklists, and code formatting).
  - **Diagram Sections**: Crisp, rendered Mermaid.js diagrams (Flowcharts, Sequences, Cloud Architectures, ER models, Mindmaps) right inside your document.
  - **Reorder & Organize**: Grab any section via its `⠿` handle to drag-and-drop reorder, or use quick `⬆️` and `⬇️` movement buttons.
  - **Inline Dividers**: Hover between any two sections to insert a new Note or Diagram at that exact location.
- **🎨 Dedicated Diagram Studio**:
  - On-demand slide-over drawer to design diagrams without crowding your active document.
  - Live Mermaid code editor with quick templates (Flowcharts, Sequence, Architecture, ER, Class, Mindmaps).
  - Interactive Vector Whiteboard Canvas for freehand sketches, shapes, and connecting arrows.
  - **⠿ Drag Diagram into Notepad**: Simply drag the diagram card from the studio directly onto your document to drop it right into place, or click **📥 Insert Section**.
- **📑 Notepad++ Multi-Tab Architecture**: Open, close, and switch between multiple documents with dirty indicators (`*`) and active tab highlights.
- **💾 Native OS File Picker & Disk Saving**: Uses the modern **File System Access API** (`window.showSaveFilePicker` / `window.showOpenFilePicker`). Lets you choose the exact folder and filename on your Mac/Windows disk and saves directly to the file on `Ctrl+S` without triggering browser downloads!
- **⚡ Real-time Autosave & Session Restore**: Never lose work. Tabs, unsaved drafts, and sections are automatically persisted in local storage.
- **🌐 Portable Exports**: Export your notes and diagrams to standard GitHub-flavored Markdown (`.md`) or standalone HTML (`.html`).
- **📱 PWA Ready**: Install as a native standalone desktop app on macOS or Windows via the browser install button.

---

## 🚀 One-Time GitHub Setup & Free Deployment

### Step 1: Create a New GitHub Repository
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (for example: `notepad-web`).
3. Leave it Public (or Private with GitHub Pro/Free Pages) and click **Create repository**.

### Step 2: Push this Project
Open PowerShell or Terminal in the `notepad-web` folder and run:

```bash
cd notepad-web
git init
git add .
git commit -m "feat: Jupyter-style notepad sections and draggable Diagram Studio"
git branch -M main
git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/notepad-web.git
git push -u origin main
```
*(Replace `<YOUR-GITHUB-USERNAME>` with your actual GitHub username)*

### Step 3: Enable GitHub Pages (2 Clicks)
1. In your GitHub repository, click on **Settings** (gear icon on the top tab).
2. On the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment > Source**, click the dropdown and choose **GitHub Actions**.
4. That's it! 

The included `.github/workflows/deploy.yml` workflow will automatically trigger, build the application, and deploy it to:
```
https://<YOUR-GITHUB-USERNAME>.github.io/notepad-web/
```

Every time you make changes and push to `main`, GitHub Actions will rebuild and update your live site within seconds!
