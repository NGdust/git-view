/* global acquireVsCodeApi */

const vscode = acquireVsCodeApi();

const root = document.getElementById("root");

/** @type {{
  branches: string[];
  commitsByBranch: Record<string, any[]>;
  currentBranch?: string; // для обратной совместимости, фактически selectedBranch
  headBranch?: string; // реальная текущая ветка в репозитории
  selectedBranch?: string; // выбранная в UI ветка
  unpushedCounts?: Record<string, number>;
  unpulledCounts?: Record<string, number>;
  expandedFolders?: Record<string, boolean>;
  selectedCommits?: string[];
  expandedDetails?: Record<string, boolean>;
}} */
let state = {
  branches: [],
  commitsByBranch: {},
  currentBranch: undefined,
  headBranch: undefined,
  selectedBranch: undefined,
  unpushedCounts: {},
  unpulledCounts: {},
  expandedFolders: {},
  selectedCommits: [],
  commitDetails: null,
  layout: {
    left: 0.25,
    right: 0.25,
  },
  expandedDetails: {},
};

function render() {
  root.innerHTML = "";

  const container = document.createElement("div");
  container.className = "container";
  container.style.display = "flex";
  container.style.width = "100%";
  container.style.height = "100%";

  const branchesColumn = document.createElement("div");
  branchesColumn.className = "column column--branches";
  branchesColumn.style.flexBasis = `${state.layout.left * 100}%`;

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
        unpushed:
          (state.unpushedCounts && state.unpushedCounts[mainBranch]) || 0,
      });
      branchesList.appendChild(mainItem);
    }

    renderBranchTree(root, branchesList, 0);
  }

  branchesColumn.appendChild(branchesList);

  const resizerLeft = createLeftResizer();

  const commitsColumn = consistsOfDetails()
    ? document.createElement("div")
    : document.createElement("div");
  commitsColumn.className = "column column--commits";

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
    const laneInfo = computeLanes(commits);
    /** @type {{ hash: string; lane: number; item: HTMLDivElement }[]} */
    const commitRows = [];

    commits.forEach((commit, index) => {
      const lane = laneInfo[commit.hash]?.lane ?? 0;
      const isLast = index === commits.length - 1;
      const isSelected =
        Array.isArray(state.selectedCommits) &&
        state.selectedCommits.includes(commit.hash);

      const item = document.createElement("div");
      item.className = "item commit-row";
      item.dataset.hash = commit.hash;
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
      const color = getColorForLane(lane);
      dot.style.borderColor = color;
      dot.style.backgroundColor = state.selectedCommits.includes(commit.hash)
        ? color
        : "transparent";
      dot.style.transform = `translateX(${lane * 10}px)`;
      timeline.appendChild(dot);

      const line = document.createElement("div");
      line.className = "commit-line";
      if (isLast) {
        line.classList.add("commit-line--last");
      }
      line.style.backgroundColor = color;
      line.style.transform = `translateX(${lane * 10}px)`;
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

      commitRows.push({ hash: commit.hash, lane, item });
    });

    drawCommitConnections(commitsList, commitRows, laneInfo, commits);
  }

  commitsColumn.appendChild(commitsList);

  const detailsColumn = document.createElement("div");
  detailsColumn.className = "column column--details";
  detailsColumn.style.flexBasis = `${state.layout.right * 100}%`;
  renderDetailsColumn(detailsColumn);

  container.appendChild(branchesColumn);
  container.appendChild(resizerLeft);
  container.appendChild(commitsColumn);
  container.appendChild(createRightResizer());
  container.appendChild(detailsColumn);

  root.appendChild(container);
}

function createBranchItem(options) {
  const { fullName, label, level, isMain, unpushed = 0 } = options;

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

  if (isHead) {
    const icon = createCurrentBranchIcon();
    row.appendChild(icon);
  }

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  if (isSelected) {
    labelEl.className = "current-branch-label";
  }

  row.appendChild(labelEl);

  const unpulled =
    (state.unpulledCounts && state.unpulledCounts[fullName]) || 0;

  if (unpulled > 0) {
    const remote = document.createElement("span");
    remote.className = "branch-remote";
    remote.textContent = `↓ ${unpulled}`;
    row.appendChild(remote);
  }

  if (unpushed > 0) {
    const counter = document.createElement("span");
    counter.className = "branch-unpushed";
    counter.textContent = `↑ ${unpushed}`;
    row.appendChild(counter);
  }

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
    // считаем "главной" первую найденную main/master
    if (!mainBranch && (name === "main" || name === "master")) {
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
      root.branches.push({
        fullName,
        label: fullName,
        unpushed:
          (state.unpushedCounts && state.unpushedCounts[fullName]) || 0,
      });
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

    node.branches.push({
      fullName,
      label: leafLabel,
      unpushed:
        (state.unpushedCounts && state.unpushedCounts[fullName]) || 0,
    });
  });

  function sortNode(node) {
    node.branches.sort((a, b) => a.label.localeCompare(b.label));

    // активная ветка (HEAD) в рамках своей группы всегда первая
    if (state.headBranch) {
      const idx = node.branches.findIndex(
        (b) => b.fullName === state.headBranch,
      );
      if (idx > 0) {
        const [active] = node.branches.splice(idx, 1);
        node.branches.unshift(active);
      }
    }

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
      unpushed: branch.unpushed || 0,
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
    case "commitDetails":
      state.commitDetails = message.payload;
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
  vscode.postMessage({ type: "requestCommitDetails", hash });
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

function getColorForLane(lane) {
  if (lane === 0) {
    // основная линия текущей ветки — оранжевая
    return "#ffb86c";
  }
  const idx = ((lane - 1) % laneColors.length + laneColors.length) % laneColors.length;
  return laneColors[idx];
}

function computeLanes(commits) {
  /** @type {Record<string, { lane: number }>} */
  const info = {};
  /** @type {(string | null)[]} */
  const lanes = [];

  const indexByHash = new Map();
  commits.forEach((c, idx) => indexByHash.set(c.hash, idx));

  commits.forEach((commit) => {
    const hash = commit.hash;
    const parents = Array.isArray(commit.parents) ? commit.parents : [];

    let laneIndex = lanes.findIndex((h) => h === hash);
    if (laneIndex === -1) {
      laneIndex = lanes.indexOf(null);
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push(null);
      }
    }

    const clampedLane = laneIndex === 0 ? 0 : 1;
    info[hash] = { lane: clampedLane };

    lanes[laneIndex] = null;

    if (parents.length > 0) {
      lanes[laneIndex] = parents[0];
      for (let i = 1; i < parents.length; i += 1) {
        const p = parents[i];
        const existing = lanes.indexOf(p);
        if (existing === -1) {
          const free = lanes.indexOf(null);
          const idx = free === -1 ? lanes.length : free;
          lanes[idx] = p;
        }
      }
    }

    for (let i = 0; i < lanes.length; i += 1) {
      const h = lanes[i];
      if (h != null && !indexByHash.has(h)) {
        lanes[i] = null;
      }
    }
  });

  return info;
}

function drawCommitConnections(container, rows, laneInfo, commits) {
  const ns = "http://www.w3.org/2000/svg";
  const existing = container.querySelector(".graph-overlay");
  if (existing) {
    existing.remove();
  }

  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("graph-overlay");
  const bounds = container.getBoundingClientRect();
  svg.setAttribute("width", String(bounds.width));
  svg.setAttribute("height", String(bounds.height));
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);

  const rect = container.getBoundingClientRect();
  /** @type {Map<string, { x: number; y: number }>} */
  const points = new Map();

  rows.forEach((row) => {
    const dot = row.item.querySelector(".commit-dot");
    if (!dot) return;
    const r = dot.getBoundingClientRect();
    const x = r.left - rect.left + r.width / 2;
    const y = r.top - rect.top + r.height / 2;
    points.set(row.hash, { x, y });
  });

  commits.forEach((commit) => {
    const from = points.get(commit.hash);
    if (!from) return;
    const lane = laneInfo[commit.hash]?.lane ?? 0;
    const color = getColorForLane(lane);

    const parents = Array.isArray(commit.parents) ? commit.parents : [];
    parents.forEach((p) => {
      const to = points.get(p);
      if (!to) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", "graph-edge");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      // если лейн тот же — рисуем прямую вертикаль/диагональ
      const parentLane = laneInfo[p]?.lane ?? lane;
      if (parentLane === lane) {
        path.setAttribute("d", `M${from.x},${from.y} L${to.x},${to.y}`);
      } else {
        // между разными линиями рисуем плавную кривую "ветку"
        const midY = (from.y + to.y) / 2;
        const d = [
          `M${from.x},${from.y}`,
          `C${from.x},${midY}`,
          `${to.x},${midY}`,
          `${to.x},${to.y}`,
        ].join(" ");
        path.setAttribute("d", d);
      }
      svg.appendChild(path);
    });
  });

  container.appendChild(svg);
}

function renderDetailsColumn(column) {
  const header = document.createElement("div");
  header.className = "column-header";
  header.textContent = "Details";
  column.appendChild(header);

  const body = document.createElement("div");
  body.className = "list details-list";

  const details = state.commitDetails;
  if (!details || !details.commit) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Select a commit to see details";
    body.appendChild(empty);
  } else {
    const { commit, files } = details;

    const filesContainer = document.createElement("div");
    filesContainer.className = "details-files";

    if (files && files.length) {
      if (!state.expandedDetails) {
        state.expandedDetails = {};
      }
      const tree = buildFileTree(files);
      renderFileTree(tree, filesContainer, 0);
    }

    body.appendChild(filesContainer);

    const metaBox = document.createElement("div");
    metaBox.className = "details-meta";

    const title = document.createElement("div");
    title.className = "details-meta-title";
    title.textContent = commit.subject;
    metaBox.appendChild(title);

    const metaLine = document.createElement("div");
    metaLine.className = "details-meta-line";
    metaLine.textContent = `${commit.hash.slice(0, 7)} · ${commit.author} · ${
      commit.date
    }`;
    metaBox.appendChild(metaLine);

    body.appendChild(metaBox);
  }

  column.appendChild(body);
}

function createRightResizer() {
  const resizer = document.createElement("div");
  resizer.className = "column-resizer";

  let startX = 0;
  let startRight = state.layout.right;

  const onMove = (event) => {
    const dx = event.clientX - startX;
    const total = window.innerWidth || 1;
    const delta = dx / total;
    let nextRight = startRight - delta;
    nextRight = Math.min(0.45, Math.max(0.15, nextRight));
    state.layout.right = nextRight;
    render();
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  resizer.onmousedown = (event) => {
    startX = event.clientX;
    startRight = state.layout.right;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return resizer;
}

function createLeftResizer() {
  const resizer = document.createElement("div");
  resizer.className = "column-resizer";

  let startX = 0;
  let startLeft = state.layout.left;

  const onMove = (event) => {
    const dx = event.clientX - startX;
    const total = window.innerWidth || 1;
    const delta = dx / total;
    let nextLeft = startLeft + delta;

    // Ограничения на саму колонку веток
    nextLeft = Math.min(0.35, Math.max(0.1, nextLeft));

    // Не даём колонке коммитов схлопнуться: минимум 0.3
    const minCommits = 0.3;
    const maxLeft = 1 - state.layout.right - minCommits;
    if (nextLeft > maxLeft) {
      nextLeft = maxLeft;
    }

    if (nextLeft < 0.1) {
      nextLeft = 0.1;
    }

    state.layout.left = nextLeft;
    render();
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  resizer.onmousedown = (event) => {
    startX = event.clientX;
    startLeft = state.layout.left;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return resizer;
}

function consistsOfDetails() {
  return true;
}

function buildFileTree(files) {
  const root = { name: "", path: "", children: new Map(), files: [] };

  files.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) {
      return;
    }
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      let child = node.children.get(part);
      if (!child) {
        const childPath = node.path ? `${node.path}/${part}` : part;
        child = { name: part, path: childPath, children: new Map(), files: [] };
        node.children.set(part, child);
      }
      node = child;
    }
    node.files.push(parts[parts.length - 1]);
  });

  return root;
}

function renderFileTree(node, container, level) {
  const indent = 8 + level * 12;

  node.children.forEach((child, name) => {
    const id = child.path || name;
    const expanded =
      !state.expandedDetails || state.expandedDetails[id] !== false;

    const row = document.createElement("div");
    row.className = "details-folder";
    row.style.paddingLeft = `${indent}px`;

    const arrow = document.createElement("span");
    arrow.className = "folder-arrow";
    arrow.textContent = expanded ? "▾" : "▸";
    row.appendChild(arrow);

    const icon = createFolderIcon();
    row.appendChild(icon);

    const label = document.createElement("span");
    label.className = "details-folder-name";
    label.textContent = name;
    row.appendChild(label);

    container.appendChild(row);

    row.onclick = () => {
      if (!state.expandedDetails) {
        state.expandedDetails = {};
      }
      state.expandedDetails[id] = !expanded;
      render();
    };

    if (expanded) {
      renderFileTree(child, container, level + 1);
    }
  });

  node.files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "details-file";
    row.style.paddingLeft = `${indent + 12}px`;
    row.textContent = file;

    const fullPath = node.path ? `${node.path}/${file}` : file;

    row.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDetailsFileContextMenu(event.clientX, event.clientY, fullPath);
    };

    container.appendChild(row);
  });
}

function openDetailsFileContextMenu(x, y, fullPath) {
  const details = state.commitDetails;
  if (!details || !details.commit) {
    return;
  }

  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const diffItem = document.createElement("div");
  diffItem.className = "context-menu-item";
  diffItem.textContent = "Diff";
  diffItem.onclick = () => {
    vscode.postMessage({
      type: "openDiff",
      hash: details.commit.hash,
      file: fullPath,
    });
    closeContextMenu();
  };

  const editItem = document.createElement("div");
  editItem.className = "context-menu-item";
  editItem.textContent = "Edit Source";
  editItem.onclick = () => {
    vscode.postMessage({
      type: "openFileSource",
      file: fullPath,
    });
    closeContextMenu();
  };

  menu.appendChild(diffItem);
  menu.appendChild(editItem);

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







