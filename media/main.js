/* global acquireVsCodeApi */

const vscode = acquireVsCodeApi();

const root = document.getElementById("root");

/** @type {{
  branches: string[];
  commitsByBranch: Record<string, any[]>;
  currentBranch?: string; // для обратной совместимости, фактически selectedBranch
  headBranch?: string; // реальная текущая ветка в репозитории
  selectedBranch?: string; // выбранная в UI ветка
  expandedFolders?: Record<string, boolean>;
  selectedCommits?: string[];
}} */
let state = {
  branches: [],
  commitsByBranch: {},
  currentBranch: undefined,
  headBranch: undefined,
  selectedBranch: undefined,
  expandedFolders: {},
  selectedCommits: [],
};

function render() {
  root.innerHTML = "";

  const container = document.createElement("div");
  container.className = "container";
  container.style.display = "flex";
  container.style.width = "100%";
  container.style.height = "100%";

  const branchesColumn = document.createElement("div");
  branchesColumn.className = "column";

  const branchesHeader = document.createElement("div");
  branchesHeader.className = "column-header";
  branchesHeader.textContent = "Branches";
  branchesColumn.appendChild(branchesHeader);

  const branchesList = document.createElement("div");
  branchesList.className = "list";

  if (state.branches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Локальные ветки не найдены.";
    branchesList.appendChild(empty);
  } else {
    if (!state.expandedFolders) {
      state.expandedFolders = {};
    }

    const { mainBranch, root } = buildBranchTree(state.branches);

    // main всегда сверху
    if (mainBranch) {
      const mainItem = createBranchItem({
        fullName: mainBranch,
        label: mainBranch,
        level: 0,
        isMain: true,
      });
      branchesList.appendChild(mainItem);
    }

    renderBranchTree(root, branchesList, 0);
  }

  branchesColumn.appendChild(branchesList);

  const commitsColumn = document.createElement("div");
  commitsColumn.className = "column";

  const commitsHeader = document.createElement("div");
  commitsHeader.className = "column-header";
  commitsHeader.textContent = "Commits";
  commitsColumn.appendChild(commitsHeader);

  const commitsList = document.createElement("div");
  commitsList.className = "list";

  const activeBranch =
    state.selectedBranch || state.currentBranch || state.headBranch;
  const commits =
    (activeBranch && state.commitsByBranch[activeBranch]) || [];

  if (!activeBranch) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Выберите ветку, чтобы увидеть коммиты.";
    commitsList.appendChild(empty);
  } else if (commits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Коммиты не найдены.";
    commitsList.appendChild(empty);
  } else {
    commits.forEach((commit, index) => {
      const isLast = index === commits.length - 1;
      const isSelected =
        Array.isArray(state.selectedCommits) &&
        state.selectedCommits.includes(commit.hash);

      const item = document.createElement("div");
      item.className = "item commit-row";
      if (isSelected) {
        item.classList.add("commit-selected");
      }
      if (commit.isMerge) {
        item.classList.add("commit-merge");
      }

      const timeline = document.createElement("div");
      timeline.className = "commit-timeline";

      const dot = document.createElement("div");
      dot.className = "commit-dot";
      const color = getColorForCommit(commit.hash);
      dot.style.borderColor = color;
      dot.style.backgroundColor = state.selectedCommits.includes(commit.hash)
        ? color
        : "transparent";
      timeline.appendChild(dot);

      const line = document.createElement("div");
      line.className = "commit-line";
      if (isLast) {
        line.classList.add("commit-line--last");
      }
      line.style.backgroundColor = color;
      timeline.appendChild(line);

      const content = document.createElement("div");
      content.className = "commit-content";

      const top = document.createElement("div");
      top.className = "commit-top";

      const title = document.createElement("div");
      title.className = "commit-title";
      title.textContent = commit.subject;

      const meta = document.createElement("div");
      meta.className = "commit-meta";
      meta.textContent = formatCommitMeta(commit);

      top.appendChild(title);
      top.appendChild(meta);

      content.appendChild(top);

      item.appendChild(timeline);
      item.appendChild(content);

      item.onclick = (event) => {
        handleCommitClick(commit.hash, event);
      };

      item.oncontextmenu = (event) => {
        event.preventDefault();
        openCommitContextMenu(event.clientX, event.clientY, commit.hash);
      };

      commitsList.appendChild(item);
    });
  }

  commitsColumn.appendChild(commitsList);

  container.appendChild(branchesColumn);
  container.appendChild(commitsColumn);

  root.appendChild(container);
}

function createBranchItem(options) {
  const { fullName, label, level, isMain } = options;

  const item = document.createElement("div");
  item.className = "item";
  if (isMain) {
    item.style.fontWeight = "600";
  }
  item.style.paddingLeft = `${8 + level * 8}px`;

  const isHead = fullName === state.headBranch;
  const isSelected =
    fullName === (state.selectedBranch || state.currentBranch);

  if (isSelected) {
    item.classList.add("selected");
  }

  const row = document.createElement("div");
  row.className = isHead ? "current-branch-row" : "";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  if (isSelected) {
    labelEl.className = "current-branch-label";
  }

  if (isHead) {
    const icon = createCurrentBranchIcon();
    row.appendChild(icon);
  }

  row.appendChild(labelEl);

  item.appendChild(row);

  item.onclick = () => {
    vscode.postMessage({ type: "selectBranch", branch: fullName });
  };

   item.oncontextmenu = (event) => {
    event.preventDefault();
    openBranchContextMenu(event.clientX, event.clientY, fullName);
  };

  return item;
}

function buildBranchTree(branchNames) {
  /** @type {string | undefined} */
  let mainBranch = undefined;

  const others = [];
  branchNames.forEach((name) => {
    if (name === "main") {
      mainBranch = name;
    } else {
      others.push(name);
    }
  });

  function createNode(name, path) {
    return {
      name,
      path,
      folders: new Map(),
      branches: [],
    };
  }

  const root = createNode("", "");

  others.forEach((fullName) => {
    const parts = fullName.split("/");
    if (parts.length === 1) {
      root.branches.push({ fullName, label: fullName });
      return;
    }

    const leafLabel = parts[parts.length - 1];
    let node = root;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      const childPath = node.path ? `${node.path}/${part}` : part;
      let child = node.folders.get(part);
      if (!child) {
        child = createNode(part, childPath);
        node.folders.set(part, child);
      }
      node = child;
    }

    node.branches.push({ fullName, label: leafLabel });
  });

  function sortNode(node) {
    node.branches.sort((a, b) => a.label.localeCompare(b.label));

    const entries = Array.from(node.folders.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    node.folders = new Map(entries);

    node.folders.forEach((child) => sortNode(child));
  }

  sortNode(root);

  return { mainBranch, root };
}

function renderBranchTree(node, container, level) {
  // сначала отдельные ветки этого уровня
  node.branches.forEach((branch) => {
    const item = createBranchItem({
      fullName: branch.fullName,
      label: branch.label,
      level,
      isMain: false,
    });
    container.appendChild(item);
  });

  // затем папки
  node.folders.forEach((child) => {
    const id = child.path || child.name;
    const isExpanded = !!state.expandedFolders[id];

    const row = document.createElement("div");
    row.className = "item folder-item";
    row.style.paddingLeft = `${8 + level * 8}px`;

    const arrow = document.createElement("span");
    arrow.className = "folder-arrow";
    arrow.textContent = isExpanded ? "▾" : "▸";

    const icon = createFolderIcon();

    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = child.name;

    row.appendChild(arrow);
    row.appendChild(icon);
    row.appendChild(name);

    row.onclick = () => {
      if (!state.expandedFolders) {
        state.expandedFolders = {};
      }
      state.expandedFolders[id] = !state.expandedFolders[id];
      render();
    };

    container.appendChild(row);

    if (isExpanded) {
      renderBranchTree(child, container, level + 1);
    }
  });
}

window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "state":
      // запомним прошлую ветку, чтобы можно было сбросить выделение при смене
      {
        const prevBranch = state.selectedBranch || state.currentBranch;
        const payload = message.payload || {};
        state = {
          ...state,
          ...payload,
        };
        const nextBranch =
          payload.selectedBranch || payload.currentBranch || payload.headBranch;
        if (nextBranch && nextBranch !== prevBranch) {
          state.selectedCommits = [];
        }
      }
      render();
      break;
    default:
      break;
  }
});

// запросить начальные данные
vscode.postMessage({ type: "init" });

function formatCommitMeta(commit) {
  let date = commit.date || "";
  if (date) {
    const parts = date.split(" ");
    if (parts.length >= 2) {
      // YYYY-MM-DD HH:MM:SS [+TZ] -> берём только дату и время
      date = `${parts[0]} ${parts[1]}`;
    }
  }

  const author = commit.author || "";

  if (author && date) {
    return `${author} - ${date}`;
  }
  if (author) {
    return author;
  }
  return date;
}

function createFolderIcon() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 16 12");
  svg.setAttribute("class", "folder-icon");

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute(
    "d",
    "M2 3a1 1 0 0 1 1-1h3l1.2 1.2A1 1 0 0 0 7.9 3.5H13a1 1 0 0 1 1 1v4.5A1.5 1.5 0 0 1 12.5 10h-9A1.5 1.5 0 0 1 2 8.5V3Z",
  );

  svg.appendChild(path);
  return svg;
}

function createCurrentBranchIcon() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("class", "current-branch-icon");

  const path = document.createElementNS(svgNS, "path");
  // жёлтый кружок
  path.setAttribute("d", "M5 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z");

  svg.appendChild(path);
  return svg;
}

let currentContextMenu;
let lastSelectedCommitHash;
const laneColors = [
  "#8be9fd",
  "#ffb86c",
  "#50fa7b",
  "#bd93f9",
  "#ff79c6",
  "#f1fa8c",
  "#ff5555",
];

function openBranchContextMenu(x, y, branch) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const checkout = document.createElement("div");
  checkout.className = "context-menu-item";
  checkout.textContent = "Checkout";
  checkout.onclick = () => {
    vscode.postMessage({
      type: "branchAction",
      action: "checkout",
      branch,
    });
    closeContextMenu();
  };

  const newBranch = document.createElement("div");
  newBranch.className = "context-menu-item";
  newBranch.textContent = "New branch";
  newBranch.onclick = () => {
    vscode.postMessage({
      type: "branchAction",
      action: "newBranch",
      branch,
    });
    closeContextMenu();
  };

  const del = document.createElement("div");
  del.className = "context-menu-item";
  del.textContent = "Delete";
  del.onclick = () => {
    vscode.postMessage({
      type: "branchAction",
      action: "delete",
      branch,
    });
    closeContextMenu();
  };

  const pull = document.createElement("div");
  pull.className = "context-menu-item";
  pull.textContent = "Pull";
  pull.onclick = () => {
    vscode.postMessage({
      type: "branchAction",
      action: "pull",
      branch,
    });
    closeContextMenu();
  };

  const push = document.createElement("div");
  push.className = "context-menu-item";
  push.textContent = "Push";
  push.onclick = () => {
    vscode.postMessage({
      type: "branchAction",
      action: "push",
      branch,
    });
    closeContextMenu();
  };

  menu.appendChild(checkout);
  menu.appendChild(newBranch);
  menu.appendChild(del);
  menu.appendChild(pull);
  menu.appendChild(push);

  document.body.appendChild(menu);
  currentContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  const maxX = window.innerWidth - rect.width - 4;
  const maxY = window.innerHeight - rect.height - 4;
  if (left > maxX) left = maxX;
  if (top > maxY) top = maxY;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onAnyClick = (event) => {
    if (!menu.contains(event.target)) {
      closeContextMenu();
    }
  };

  window.addEventListener("mousedown", onAnyClick, { once: true });
}

function closeContextMenu() {
  if (currentContextMenu && currentContextMenu.parentElement) {
    currentContextMenu.parentElement.removeChild(currentContextMenu);
  }
  currentContextMenu = undefined;
}

function handleCommitClick(hash, event) {
  if (!Array.isArray(state.selectedCommits)) {
    state.selectedCommits = [];
  }

  const multi = event.metaKey || event.ctrlKey;
  const range = event.shiftKey;

  if (range && lastSelectedCommitHash && state.currentBranch) {
    const commits = getCurrentCommits();
    const startIndex = commits.findIndex(
      (c) => c.hash === lastSelectedCommitHash,
    );
    const endIndex = commits.findIndex((c) => c.hash === hash);

    if (startIndex !== -1 && endIndex !== -1) {
      const [from, to] =
        startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      const rangeHashes = commits
        .slice(from, to + 1)
        .map((c) => c.hash)
        .filter(Boolean);
      state.selectedCommits = rangeHashes;
    } else {
      state.selectedCommits = [hash];
    }
  } else if (multi) {
    if (state.selectedCommits.includes(hash)) {
      state.selectedCommits = state.selectedCommits.filter((h) => h !== hash);
    } else {
      state.selectedCommits = [...state.selectedCommits, hash];
    }
  } else {
    state.selectedCommits = [hash];
  }

  lastSelectedCommitHash = hash;
  render();
}

function openCommitContextMenu(x, y, hash) {
  if (!Array.isArray(state.selectedCommits)) {
    state.selectedCommits = [];
  }

  if (!state.selectedCommits.includes(hash)) {
    state.selectedCommits = [hash];
  }

  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const selected = state.selectedCommits || [];

  const squash = document.createElement("div");
  squash.className = "context-menu-item";
  squash.textContent = "Squash Commits...";
  if (selected.length < 2) {
    squash.classList.add("context-menu-item--disabled");
  } else {
    squash.onclick = () => {
      vscode.postMessage({
        type: "commitAction",
        action: "squash",
        commits: selected,
        branch: state.currentBranch,
      });
      closeContextMenu();
    };
  }

  const reset = document.createElement("div");
  reset.className = "context-menu-item";
  reset.textContent = "Reset current branch to here";
  reset.onclick = () => {
    vscode.postMessage({
      type: "commitAction",
      action: "reset",
      commits: [hash],
      branch: state.currentBranch,
    });
    closeContextMenu();
  };

  const changeText = document.createElement("div");
  changeText.className = "context-menu-item";
  changeText.textContent = "Change text";
  if (selected.length !== 1) {
    changeText.classList.add("context-menu-item--disabled");
  } else {
    changeText.onclick = () => {
      vscode.postMessage({
        type: "commitAction",
        action: "changeMessage",
        commits: [hash],
        branch: state.currentBranch,
      });
      closeContextMenu();
    };
  }

  const cherryPick = document.createElement("div");
  cherryPick.className = "context-menu-item";
  cherryPick.textContent = "Cherry-Pick";
  cherryPick.onclick = () => {
    vscode.postMessage({
      type: "commitAction",
      action: "cherryPick",
      commits: selected.length ? selected : [hash],
      branch: state.currentBranch,
    });
    closeContextMenu();
  };

  menu.appendChild(squash);
  menu.appendChild(reset);
  menu.appendChild(changeText);
  menu.appendChild(cherryPick);

  document.body.appendChild(menu);
  currentContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  const maxX = window.innerWidth - rect.width - 4;
  const maxY = window.innerHeight - rect.height - 4;
  if (left > maxX) left = maxX;
  if (top > maxY) top = maxY;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onAnyClick = (e) => {
    if (!menu.contains(e.target)) {
      closeContextMenu();
    }
  };

  window.addEventListener("mousedown", onAnyClick, { once: true });
}

function getCurrentCommits() {
  if (!state.currentBranch) {
    return [];
  }
  const commits =
    state.commitsByBranch && state.commitsByBranch[state.currentBranch];
  return Array.isArray(commits) ? commits : [];
}

function getColorForCommit(hash) {
  if (!hash || !laneColors.length) {
    return "var(--vscode-editor-foreground)";
  }
  let acc = 0;
  for (let i = 0; i < hash.length; i += 1) {
    acc = (acc * 31 + hash.charCodeAt(i)) >>> 0;
  }
  const idx = acc % laneColors.length;
  return laneColors[idx];
}







