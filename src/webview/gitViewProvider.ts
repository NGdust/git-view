import * as vscode from 'vscode';
import { GitService, BranchInfo, CommitInfo } from '../git/gitService';

export class GitViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitPluginView';
    private _view?: vscode.WebviewView;
    private _gitService?: GitService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        gitService?: GitService
    ) {
        this._gitService = gitService;
    }
    
    public setGitService(gitService: GitService) {
        this._gitService = gitService;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    await this.refresh();
                    break;
                case 'checkout':
                    await vscode.commands.executeCommand('gitPlugin.checkout', message.branch);
                    break;
                case 'createBranch':
                    await vscode.commands.executeCommand('gitPlugin.createBranch', message.fromBranch);
                    break;
                case 'compare':
                    await vscode.commands.executeCommand('gitPlugin.compare', message.branch1, message.branch2);
                    break;
                case 'showDiff':
                    await vscode.commands.executeCommand('gitPlugin.showDiff', message.branch);
                    break;
                case 'rebase':
                    await vscode.commands.executeCommand('gitPlugin.rebase', message.branch, message.onto);
                    break;
                case 'merge':
                    await vscode.commands.executeCommand('gitPlugin.merge', message.branch, message.into);
                    break;
                case 'push':
                    await vscode.commands.executeCommand('gitPlugin.push', message.branch);
                    break;
                case 'pull':
                    await vscode.commands.executeCommand('gitPlugin.pull', message.branch);
                    break;
                case 'rename':
                    await vscode.commands.executeCommand('gitPlugin.rename', message.branch);
                    break;
                case 'delete':
                    await vscode.commands.executeCommand('gitPlugin.delete', message.branch);
                    break;
                case 'cherryPick':
                    await vscode.commands.executeCommand('gitPlugin.cherryPick', message.commitHash);
                    break;
                case 'revert':
                    await vscode.commands.executeCommand('gitPlugin.revert', message.commitHash);
                    break;
                case 'reset':
                    await vscode.commands.executeCommand('gitPlugin.reset', message.commitHash);
                    break;
                case 'selectCommit':
                    await this.selectCommit(message.commitHash);
                    break;
                case 'search':
                    await this.searchCommits(message.query);
                    break;
                case 'copy':
                    await vscode.commands.executeCommand('gitPlugin.copyRevision', message.commitHash);
                    break;
            }
        });

        if (this._gitService && this._view) {
            this.refresh();
        }
    }

    public async refresh() {
        if (!this._gitService || !this._view) {
            if (!this._gitService) {
                console.log('Git Plugin: GitService not available yet');
            }
            return;
        }
        try {
            const branches = await this._gitService.getBranches();
            const commits = await this._gitService.getCommits();
            const tags = await this._gitService.getTags();

            this._view.webview.postMessage({
                command: 'update',
                branches,
                commits,
                tags
            });
        } catch (error) {
            console.error('Error refreshing view:', error);
        }
    }

    private async selectCommit(commitHash: string) {
        if (this._view && this._gitService) {
            const diff = await this._gitService.getWorkingTreeDiff(commitHash);
            this._view.webview.postMessage({
                command: 'showDiff',
                diff,
                commitHash
            });
        }
    }

    private async searchCommits(query: string) {
        if (this._view && this._gitService) {
            const commits = await this._gitService.getCommits(1000);
            const filtered = commits.filter(c =>
                c.message.toLowerCase().includes(query.toLowerCase()) ||
                c.hash.toLowerCase().includes(query.toLowerCase()) ||
                c.author.toLowerCase().includes(query.toLowerCase())
            );

            this._view.webview.postMessage({
                command: 'updateCommits',
                commits: filtered
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );

        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Git Log</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="search-bar">
                <input type="text" id="searchInput" placeholder="Q- Text or hash" />
                <div class="filters">
                    <button class="filter-btn">Co</button>
                    <button class="filter-btn">Branch</button>
                    <button class="filter-btn">User</button>
                    <button class="filter-btn">Date</button>
                    <button class="filter-btn">Paths</button>
                </div>
            </div>
        </div>
        <div class="main-content">
            <div class="sidebar">
                <div class="branch-section">
                    <div class="section-header">
                        <span>HEAD (Current Branch)</span>
                    </div>
                    <div class="branch-group">
                        <div class="group-title">Local</div>
                        <div id="localBranches" class="branch-list"></div>
                    </div>
                    <div class="branch-group">
                        <div class="group-title">Remote</div>
                        <div id="remoteBranches" class="branch-list"></div>
                    </div>
                    <div class="branch-group">
                        <div class="group-title">Tags</div>
                        <div id="tags" class="branch-list"></div>
                    </div>
                </div>
            </div>
            <div class="commit-view">
                <div id="commitGraph" class="commit-graph"></div>
                <div id="commitList" class="commit-list"></div>
            </div>
        </div>
    </div>
    <div id="contextMenu" class="context-menu hidden"></div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}

