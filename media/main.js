const vscode = acquireVsCodeApi();

let branches = { local: [], remote: [] };
let commits = [];
let tags = [];
let selectedBranch = null;
let selectedCommit = null;
let contextMenu = null;

document.addEventListener('DOMContentLoaded', () => {
    contextMenu = document.getElementById('contextMenu');
    
    setupSearch();
    setupEventListeners();
    
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'update':
                branches = message.branches;
                commits = message.commits;
                tags = message.tags;
                renderBranches();
                renderCommits();
                renderTags();
                break;
            case 'updateCommits':
                commits = message.commits;
                renderCommits();
                break;
            case 'showDiff':
                showDiff(message.diff, message.commitHash);
                break;
        }
    });
});

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        
        searchTimeout = setTimeout(() => {
            if (query.trim()) {
                vscode.postMessage({
                    command: 'search',
                    query: query
                });
            } else {
                vscode.postMessage({
                    command: 'refresh'
                });
            }
        }, 300);
    });
}

function setupEventListeners() {
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

function renderBranches() {
    const localContainer = document.getElementById('localBranches');
    const remoteContainer = document.getElementById('remoteBranches');
    
    localContainer.innerHTML = '';
    remoteContainer.innerHTML = '';
    
    // Группируем локальные ветки по префиксу (например, vgarganchuk/)
    const localGroups = groupBranchesByPrefix(branches.local);
    if (localGroups.default.length > 0 || Object.keys(localGroups.groups).length > 0) {
        // Показываем ветки без префикса
        localGroups.default.forEach(branch => {
            const item = createBranchItem(branch, 'local');
            localContainer.appendChild(item);
        });
        
        // Показываем сгруппированные ветки
        Object.keys(localGroups.groups).sort().forEach(prefix => {
            const group = document.createElement('div');
            group.className = 'branch-group-item';
            const groupTitle = document.createElement('div');
            groupTitle.className = 'group-title';
            groupTitle.textContent = prefix;
            group.appendChild(groupTitle);
            
            const list = document.createElement('div');
            list.className = 'branch-list';
            
            localGroups.groups[prefix].forEach(branch => {
                const item = createBranchItem(branch, 'local');
                list.appendChild(item);
            });
            
            group.appendChild(list);
            localContainer.appendChild(group);
        });
    }
    
    const remoteGroups = groupBranchesByRemote(branches.remote);
    Object.keys(remoteGroups).forEach(remoteName => {
        const group = document.createElement('div');
        group.className = 'remote-group';
        const groupTitle = document.createElement('div');
        groupTitle.className = 'group-title';
        groupTitle.textContent = remoteName;
        group.appendChild(groupTitle);
        
        const list = document.createElement('div');
        list.className = 'branch-list';
        
        // Группируем удаленные ветки по префиксу
        const prefixGroups = groupBranchesByPrefix(remoteGroups[remoteName]);
        prefixGroups.default.forEach(branch => {
            const item = createBranchItem(branch, 'remote');
            list.appendChild(item);
        });
        
        Object.keys(prefixGroups.groups).sort().forEach(prefix => {
            const prefixGroup = document.createElement('div');
            prefixGroup.className = 'branch-group-item';
            const prefixTitle = document.createElement('div');
            prefixTitle.className = 'group-title';
            prefixTitle.textContent = prefix;
            prefixGroup.appendChild(prefixTitle);
            
            const prefixList = document.createElement('div');
            prefixList.className = 'branch-list';
            
            prefixGroups.groups[prefix].forEach(branch => {
                const item = createBranchItem(branch, 'remote');
                prefixList.appendChild(item);
            });
            
            prefixGroup.appendChild(prefixList);
            list.appendChild(prefixGroup);
        });
        
        group.appendChild(list);
        remoteContainer.appendChild(group);
    });
}

function groupBranchesByPrefix(branchList) {
    const groups = {};
    const defaultBranches = [];
    
    branchList.forEach(branch => {
        const parts = branch.name.split('/');
        if (parts.length > 1) {
            const prefix = parts[0];
            if (!groups[prefix]) {
                groups[prefix] = [];
            }
            groups[prefix].push(branch);
        } else {
            defaultBranches.push(branch);
        }
    });
    
    return { default: defaultBranches, groups };
}

function groupBranchesByRemote(remoteBranches) {
    const groups = {};
    remoteBranches.forEach(branch => {
        const parts = branch.name.split('/');
        const remote = parts[0];
        if (!groups[remote]) {
            groups[remote] = [];
        }
        groups[remote].push(branch);
    });
    return groups;
}

function createBranchItem(branch, type) {
    const item = document.createElement('div');
    item.className = `branch-item ${branch.current ? 'current' : ''}`;
    item.textContent = branch.name;
    
    if (branch.current) {
        const star = document.createElement('span');
        star.innerHTML = '★';
        star.className = 'star-icon';
        item.insertBefore(star, item.firstChild);
    }
    
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBranch(branch.name);
    });
    
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showBranchContextMenu(e, branch, type);
    });
    
    return item;
}

function renderTags() {
    const tagsContainer = document.getElementById('tags');
    tagsContainer.innerHTML = '';
    
    tags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'tag-item';
        item.innerHTML = `<span class="tag-icon">🏷</span>${tag}`;
        tagsContainer.appendChild(item);
    });
}

function renderCommits() {
    const commitList = document.getElementById('commitList');
    const commitGraph = document.getElementById('commitGraph');
    
    commitList.innerHTML = '';
    commitGraph.innerHTML = '';
    
    commits.forEach((commit, index) => {
        const graphDot = document.createElement('div');
        graphDot.className = 'commit-graph-dot';
        graphDot.style.left = '26px';
        graphDot.style.top = `${index * 60 + 12}px`;
        
        const colors = ['#858585', '#4ec9b0', '#dcdcaa', '#c586c0', '#569cd6', '#ce9178'];
        graphDot.style.backgroundColor = colors[index % colors.length];
        
        // Добавляем вертикальные линии между коммитами
        if (index > 0) {
            const line = document.createElement('div');
            line.className = 'commit-graph-line';
            line.style.left = '29px';
            line.style.top = `${index * 60}px`;
            line.style.width = '2px';
            line.style.height = '60px';
            line.style.backgroundColor = colors[(index - 1) % colors.length];
            commitGraph.appendChild(line);
        }
        
        commitGraph.appendChild(graphDot);
        
        const commitItem = document.createElement('div');
        commitItem.className = 'commit-item';
        commitItem.innerHTML = `
            <div class="commit-message">
                <div>${escapeHtml(commit.message)}</div>
                <div class="commit-meta">
                    <span class="commit-hash">${commit.shortHash}</span>
                    <span>${commit.author}</span>
                    <span>${commit.date}</span>
                    ${commit.branches.length > 0 ? `
                        <div class="commit-branches">
                            ${commit.branches.map(b => `<span class="branch-badge">${escapeHtml(b)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        commitItem.addEventListener('click', (e) => {
            selectCommit(commit, e);
        });
        
        commitItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCommitContextMenu(e, commit);
        });
        
        commitList.appendChild(commitItem);
    });
}

function selectBranch(branchName) {
    selectedBranch = branchName;
    document.querySelectorAll('.branch-item').forEach(item => {
        item.classList.remove('selected');
        if (item.textContent.includes(branchName)) {
            item.classList.add('selected');
        }
    });
}

function selectCommit(commit, event) {
    selectedCommit = commit;
    document.querySelectorAll('.commit-item').forEach(item => {
        item.classList.remove('selected');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('selected');
    }
    
    vscode.postMessage({
        command: 'selectCommit',
        commitHash: commit.hash
    });
}

function showBranchContextMenu(event, branch, type) {
    const menuItems = [
        { label: 'Checkout', command: 'checkout', shortcut: null },
        { label: `New Branch from '${branch.name}'...`, command: 'createBranch', shortcut: null },
        { separator: true },
        { label: 'Update', command: 'pull', shortcut: null },
        { label: 'Push...', command: 'push', shortcut: null },
        { label: 'Rename...', command: 'rename', shortcut: 'F2' },
        { label: 'Delete', command: 'delete', shortcut: null }
    ];
    
    if (type === 'local' && selectedBranch && selectedBranch !== branch.name) {
        menuItems.splice(2, 0, 
            { label: `Checkout and Rebase onto '${branch.name}'`, command: 'rebase', shortcut: null },
            { label: `Compare with '${branch.name}'`, command: 'compare', shortcut: null },
            { label: 'Show Diff with Working Tree', command: 'showDiff', shortcut: null },
            { separator: true },
            { label: `Rebase '${branch.name}' onto '${selectedBranch}'`, command: 'rebase', shortcut: null },
            { label: `Merge '${selectedBranch}' into '${branch.name}'`, command: 'merge', shortcut: null }
        );
    }
    
    showContextMenu(event, menuItems, () => {
        return { branch: branch.name };
    });
}

function showCommitContextMenu(event, commit) {
    const menuItems = [
        { label: 'Copy Revision Number', command: 'copy', shortcut: 'C' },
        { label: 'Create Patch...', command: 'patch', shortcut: null },
        { label: 'Cherry-Pick', command: 'cherryPick', shortcut: null },
        { separator: true },
        { label: 'Checkout Revision', command: 'checkout', shortcut: null },
        { label: 'Show Repository at Revision', command: 'showRepo', shortcut: null },
        { label: 'Compare with Local', command: 'compare', shortcut: null },
        { separator: true },
        { label: 'Reset Current Branch to Here...', command: 'reset', shortcut: null },
        { label: 'Revert Commit', command: 'revert', shortcut: null },
        { separator: true },
        { label: 'Edit Commit Message...', command: 'edit', shortcut: 'F2' },
        { label: 'Fixup...', command: 'fixup', shortcut: null },
        { label: 'Squash Into...', command: 'squash', shortcut: null },
        { separator: true },
        { label: 'Drop Commits', command: 'drop', shortcut: null },
        { label: 'Squash Commits...', command: 'squashAll', shortcut: null },
        { label: 'Interactively Rebase from Here...', command: 'rebaseInteractive', shortcut: null },
        { separator: true },
        { label: 'Push All up to Here...', command: 'pushUpTo', shortcut: null },
        { separator: true },
        { label: 'New Branch...', command: 'createBranch', shortcut: null },
        { label: 'New Tag...', command: 'createTag', shortcut: null },
        { separator: true },
        { label: 'Go to Child Commit', command: 'goToChild', shortcut: null },
        { label: 'Go to Parent Commit', command: 'goToParent', shortcut: null },
        { separator: true },
        { label: 'Open on GitLab', command: 'openGitLab', shortcut: null }
    ];
    
    showContextMenu(event, menuItems, () => {
        return { commitHash: commit.hash };
    });
}

function showContextMenu(event, items, getContext) {
    contextMenu.innerHTML = '';
    contextMenu.classList.remove('hidden');
    
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    
    items.forEach(item => {
        if (item.separator) {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            contextMenu.appendChild(separator);
        } else {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = item.label;
            
            if (item.shortcut) {
                const shortcut = document.createElement('span');
                shortcut.className = 'context-menu-shortcut';
                shortcut.textContent = item.shortcut;
                menuItem.appendChild(shortcut);
            }
            
            menuItem.addEventListener('click', () => {
                const context = getContext();
                const message = {
                    command: item.command,
                    ...context
                };
                
                // Добавляем commitHash если он есть в item
                if (item.commitHash) {
                    message.commitHash = item.commitHash;
                }
                
                vscode.postMessage(message);
                hideContextMenu();
            });
            
            contextMenu.appendChild(menuItem);
        }
    });
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
}

function showDiff(diff, commitHash) {
    // Можно открыть diff в отдельной панели или встроить в UI
    console.log('Showing diff for commit:', commitHash);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

