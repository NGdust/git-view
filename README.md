<div align="center">
  <h1>Git Panel</h1>
  <p>Compact Git UI panel for VS Code and Cursor</p>
</div>

![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Git Panel is a minimal, fast Git UI that lives in the bottom panel of VS Code / Cursor.  
It shows branches, commits and commit details in a clean 3-column layout and focuses on everyday workflows.

---

## ✨ Features

- **Branches column**
  - Local branches grouped by folders (split by `/`)
  - Expandable folders with small folder icons
  - Current `HEAD` branch marked with a yellow circle
  - Context menu (right click): `Checkout`, `New branch`, `Delete`, `Pull`, `Push`

- **Commits column**
  - Compact commit list for the selected branch
  - Colored graph with main and secondary lanes, merge links and branch “offsprings”
  - Single and multi-selection (Ctrl/Cmd click, Shift range selection)
  - Commit context menu:
    - `Squash Commits…`
    - `Reset current branch to here`
    - `Change text`
    - `Cherry-Pick`

- **Details column**
  - Hierarchical file tree for the selected commit (relative to repository root)
  - Collapsible folders with icons
  - Files in blue, clickable:
    - Left click — open diff for the file in a separate editor tab
    - Right click — `Edit Source` (opens file in editor)
  - Pinned block at the bottom with commit message, hash, author and date

- **Panel layout**
  - 3 resizable columns: Branches – Commits – Details
  - Column widths can be adjusted with mouse drag on vertical splitters

---

## 🚀 Installation

### From VSIX (recommended for this repo)

1. Build the extension (from project root):

   ```bash
   npm install
   npm run build
   npx vsce package
   ```

   This produces a file like `git-plugin-vc-0.0.1.vsix`.

2. In VS Code / Cursor:
   - Open **Extensions**
   - Click `…` → `Install from VSIX…`
   - Select the generated `.vsix` file

3. Reload the editor.

---

## ▶️ Usage

1. Open a Git repository folder in VS Code / Cursor.
2. Open the **Git Panel** view in the bottom panel.
3. In the left column:
   - Choose a branch; commits for that branch appear in the middle column.
4. In the commits column:
   - Click a commit to see file changes and metadata in the right column.
   - Use right click on commits for actions like squash, reset, cherry-pick.
5. In the details column:
   - Click files to open diffs.
   - Right-click a file → **Edit Source** to open it directly.

---

## 📝 License

This project is licensed under the MIT License – see the [`LICENSE`](LICENSE) file for details.



