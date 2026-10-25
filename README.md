# 🦎 Notepad++ Cloud & Canvas

A modern, cross-platform reimagining of **Notepad++** built for **macOS**, **Windows**, **Linux**, and **Web/Mobile**. 

Combines the speed, familiarity, and multi-tab workflow of Notepad++ with rich Monaco code editing, code diagramming (Mermaid.js), an interactive visual whiteboard canvas, native disk file saving, and Google Cloud sync.

---

## ✨ Features

- **📑 Notepad++ Multi-Tab Architecture**: Open, close, reorder, and switch between multiple documents with dirty indicators (`*`) and active tab highlights.
- **💾 Native OS File Picker & Disk Saving**: Uses the modern **File System Access API** (`window.showSaveFilePicker` / `window.showOpenFilePicker`). Lets you choose the exact folder and filename on your Mac/Windows disk and saves directly to the file on `Ctrl+S` without triggering browser downloads!
- **⚡ Real-time Autosave & Session Restore**: Never lose work. Tabs, unsaved drafts, and canvas drawings are automatically persisted in local indexed storage.
- **📊 Diagramming (2 Modes)**:
  - **Live Code Diagrams**: Powered by Mermaid.js (Flowcharts, Sequences, Architecture diagrams, ER models, Mindmaps, Class diagrams).
  - **Visual Whiteboard Canvas**: Interactive vector whiteboard with shapes, arrows, text, and PNG export.
- **☁️ Google Account / Cloud Sync**: Sign in with your Google account on any browser (Chrome, Safari, Edge, Firefox) to access your synced documents across all your devices.
- **🎨 Notepad++ Aesthetics**: Classic chameleon theme with modern dark and light modes, customizable line numbers, syntax highlighting for 50+ languages, minimap, and keyboard shortcuts (`Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+W`, `Ctrl+F`).
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
git commit -m "Initial commit of Notepad++ Web"
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
