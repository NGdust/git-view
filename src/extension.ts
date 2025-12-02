import * as vscode from "vscode";

import { GitService } from "./git/gitService";

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri ?? undefined;
  const gitService = new GitService(workspaceFolder);

  const provider = new GitPanelViewProvider(context.extensionUri, gitService);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("gitPanelView", provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitPanel.refresh", () => {
      provider.refresh();
    }),
  );
}

class GitPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitPanelView";

  private _view?: vscode.WebviewView;
  private _currentBranch: string | undefined;
  private _lastCommits: import("./git/gitService").GitCommit[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly git: GitService,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
  ): void | Thenable<void> {
    this._view = webviewView;
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
    };

    webview.html = this.getHtmlForWebview(webview);

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "init":
          await this.pushState();
          break;
        case "selectBranch":
          this._currentBranch = message.branch;
          await this.pushState();
          break;
        case "branchAction":
          await this.handleBranchAction(message.action, message.branch);
          break;
        case "commitAction":
          await this.handleCommitAction(message.action, message.commits);
          break;
        case "openDiff":
          await this.openDiffForFile(message.hash, message.file);
          break;
        case "openFileSource":
          await this.openFileInEditor(message.file);
          break;
        case "requestCommitDetails":
          await this.sendCommitDetails(message.hash);
          break;
        default:
          break;
      }
    });

    this.pushState().catch(() => {
      // ignore initial load errors
    });
  }

  public refresh(): void {
    this.pushState().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to refresh git panel", error);
    });
  }

  private async handleBranchAction(
    action: string,
    branch: string,
  ): Promise<void> {
    try {
      switch (action) {
        case "checkout":
          await this.git.checkoutBranch(branch);
          this._currentBranch = branch;
          await this.pushState();
          break;
        case "pull":
          await this.git.pullBranch(branch);
          this._currentBranch = branch;
          await this.pushState();
          break;
        case "push":
          await this.confirmAndPush(branch);
          break;
        case "newBranch": {
          const newName = await vscode.window.showInputBox({
            title: "New branch",
            prompt: `Новая ветка от "${branch}"`,
            value: `${branch}/`,
            ignoreFocusOut: true,
            validateInput: (value) => {
              if (!value.trim()) {
                return "Имя ветки не может быть пустым";
              }
              return null;
            },
          });

          if (!newName) {
            return;
          }

          await this.git.createBranchFrom(branch, newName.trim());
          this._currentBranch = newName.trim();
          await this.pushState();
          break;
        }
        case "delete": {
          const answer = await vscode.window.showWarningMessage(
            `Удалить ветку "${branch}"?`,
            { modal: true },
            "Удалить",
            "Отмена",
          );
          if (answer !== "Удалить") {
            return;
          }

          await this.git.deleteBranch(branch);
          if (this._currentBranch === branch) {
            this._currentBranch = undefined;
          }
          await this.pushState();
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Неизвестная ошибка git";
      // eslint-disable-next-line no-console
      console.error("Git branch action failed", error);
      void vscode.window.showErrorMessage(
        `Git Panel: не удалось выполнить действие с веткой (${message})`,
      );
    }
  }
  private async confirmAndPush(branch: string): Promise<void> {
    const commits = await this.git.getUnpushedCommits(branch);

    const list =
      commits.length === 0
        ? "No local commits ahead of upstream."
        : commits
            .map((c) => c.subject)
            .slice(0, 20)
            .join("\n");

    const detail =
      commits.length === 0
        ? list
        : `${commits.length} сommits to push:\n${list}`;

    const choice = await vscode.window.showInformationMessage(
      `Push branch "${branch}"?`,
      {
        modal: true,
        detail,
      },
      "Push",
      "Push Force",
    );

    if (!choice) {
      return;
    }

    const force = choice === "Push Force";
    await this.git.pushBranch(branch, force);
    await this.pushState();
  }

  private async handleCommitAction(
    action: string,
    hashes: string[],
  ): Promise<void> {
    if (!this._currentBranch || hashes.length === 0) {
      return;
    }

    try {
      const commits = this._lastCommits;

      switch (action) {
        case "reset": {
          const target = hashes[0];
          const answer = await vscode.window.showWarningMessage(
            `Сбросить текущую ветку к коммиту ${target.slice(
              0,
              7,
            )}? Все незакоммиченные изменения будут потеряны.`,
            { modal: true },
            "Сбросить",
            "Отмена",
          );
          if (answer !== "Сбросить") {
            return;
          }
          await this.git.resetToCommit(target);
          await this.pushState();
          break;
        }
        case "changeMessage": {
          const target = hashes[0];
          const head = commits[0];
          if (!head || head.hash !== target) {
            void vscode.window.showErrorMessage(
              "Изменение сообщения поддерживается только для последнего коммита (HEAD).",
            );
            return;
          }
          const newMessage = await vscode.window.showInputBox({
            title: "Change commit message",
            prompt: "Новое сообщение для последнего коммита",
            value: head.subject,
            ignoreFocusOut: true,
          });
          if (!newMessage || !newMessage.trim()) {
            return;
          }
          await this.git.changeLastCommitMessage(newMessage.trim());
          await this.pushState();
          break;
        }
        case "cherryPick": {
          const ordered = this.orderCommitsByHistory(hashes, commits);
          await this.git.cherryPickCommits(ordered);
          await this.pushState();
          break;
        }
        case "squash": {
          if (hashes.length < 2) {
            return;
          }
          const ordered = this.orderCommitsByHistory(hashes, commits);
          const oldest = ordered[0];
          const newestHash = ordered[ordered.length - 1];
          const newest =
            commits.find((c) => c.hash === newestHash) ?? commits[0];

          const message = await vscode.window.showInputBox({
            title: "Squash commits",
            prompt:
              "Сообщение для нового коммита после squash (по умолчанию — сообщение самого нового)",
            value: newest?.subject,
            ignoreFocusOut: true,
          });
          if (!message || !message.trim()) {
            return;
          }

          const confirm = await vscode.window.showWarningMessage(
            `Будут объединены ${ordered.length} коммит(ов) в один. История ветки изменится.`,
            { modal: true },
            "Продолжить",
            "Отмена",
          );
          if (confirm !== "Продолжить") {
            return;
          }

          await this.git.squashCommits(oldest, message.trim());
          await this.pushState();
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Неизвестная ошибка git";
      // eslint-disable-next-line no-console
      console.error("Git commit action failed", error);
      void vscode.window.showErrorMessage(
        `Git Panel: не удалось выполнить действие с коммитами (${message})`,
      );
    }
  }

  private orderCommitsByHistory(
    hashes: string[],
    commits: import("./git/gitService").GitCommit[],
  ): string[] {
    const indexByHash = new Map<string, number>();
    commits.forEach((c, idx) => {
      indexByHash.set(c.hash, idx);
    });
    return [...hashes].sort((a, b) => {
      const ia = indexByHash.get(a) ?? 0;
      const ib = indexByHash.get(b) ?? 0;
      // в списке коммиты идут от нового к старому, нам нужно от старого к новому
      return ib - ia;
    });
  }

  private async sendCommitDetails(hash: string): Promise<void> {
    if (!this._view) {
      return;
    }
    try {
      const details = await this.git.getCommitDetails(hash);
      const commit = this._lastCommits.find((c) => c.hash === hash) ?? null;
      this._view.webview.postMessage({
        type: "commitDetails",
        payload: {
          hash,
          commit,
          files: details.files,
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load commit details", error);
    }
  }

  private async openDiffForFile(
    hash: string,
    relativePath: string,
  ): Promise<void> {
    try {
      const diffText = await this.git.getDiffForFile(hash, relativePath);
      if (!diffText) {
        void vscode.window.showWarningMessage(
          `Нет diff для файла ${relativePath} в коммите ${hash.slice(0, 7)}`,
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: diffText,
        language: "diff",
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Неизвестная ошибка diff";
      // eslint-disable-next-line no-console
      console.error("Git diff failed", error);
      void vscode.window.showErrorMessage(
        `Git Panel: не удалось открыть diff (${message})`,
      );
    }
  }

  private async openFileInEditor(relativePath: string): Promise<void> {
    try {
      const workspaceFolderUri =
        vscode.workspace.workspaceFolders?.[0]?.uri ?? undefined;
      if (!workspaceFolderUri) {
        return;
      }
      const uri = vscode.Uri.joinPath(workspaceFolderUri, relativePath);
      await vscode.window.showTextDocument(uri, { preview: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось открыть файл";
      // eslint-disable-next-line no-console
      console.error("Open file failed", error);
      void vscode.window.showErrorMessage(
        `Git Panel: ${message} (${relativePath})`,
      );
    }
  }

  private async pushState(): Promise<void> {
    if (!this._view) {
      return;
    }

    const branches = await this.git.getBranches();
    const headBranch = branches.find((b) => b.current)?.name;
    const selectedBranch =
      this._currentBranch ?? headBranch ?? branches[0]?.name;

    const commits = selectedBranch
      ? await this.git.getCommits(selectedBranch)
      : [];

    this._currentBranch = selectedBranch;
    this._lastCommits = commits;

    const [unpushedEntries, unpulledEntries] = await Promise.all([
      Promise.all(
        branches.map(async (b) => {
          try {
            const list = await this.git.getUnpushedCommits(b.name);
            return [b.name, list.length] as const;
          } catch {
            return [b.name, 0] as const;
          }
        }),
      ),
      Promise.all(
        branches.map(async (b) => {
          try {
            const count = await this.git.getUnpulledCommits(b.name);
            return [b.name, count] as const;
          } catch {
            return [b.name, 0] as const;
          }
        }),
      ),
    ]);
    const unpushedCounts = Object.fromEntries(unpushedEntries);
    const unpulledCounts = Object.fromEntries(unpulledEntries);

    this._view.webview.postMessage({
      type: "state",
      payload: {
        branches: branches.map((b) => b.name),
        commitsByBranch: selectedBranch ? { [selectedBranch]: commits } : {},
        currentBranch: selectedBranch,
        headBranch,
        selectedBranch,
        unpushedCounts,
        unpulledCounts,
      },
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css"),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js"),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${
    webview.cspSource
  } https:; script-src 'nonce-${nonce}'; style-src ${
      webview.cspSource
    } 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${stylesUri}" rel="stylesheet" />
  <title>Git Panel</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function deactivate() {
  // no-op
}



