import * as vscode from 'vscode';
import { GitService } from './git/gitService';
import { GitViewProvider } from './webview/gitViewProvider';

let gitService: GitService;
let gitViewProvider: GitViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Plugin: Activating extension...');
    
    // Сначала регистрируем провайдер, даже если нет workspace
    // Это важно, чтобы view мог загрузиться
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let workspaceRoot: string | undefined;
    
    if (workspaceFolders && workspaceFolders.length > 0) {
        workspaceRoot = workspaceFolders[0].uri.fsPath;
        console.log('Git Plugin: Workspace root:', workspaceRoot);
        gitService = new GitService(workspaceRoot);
    } else {
        console.log('Git Plugin: No workspace folder found, creating placeholder service');
        // Создаем временный сервис, который будет заменен позже
        gitService = new GitService(process.cwd());
    }
    
    gitViewProvider = new GitViewProvider(context.extensionUri, gitService);

    // Регистрируем провайдер для view СИНХРОННО - это критически важно!
    console.log('Git Plugin: Registering view provider with viewType:', GitViewProvider.viewType);
    const provider = vscode.window.registerWebviewViewProvider(
        GitViewProvider.viewType,
        gitViewProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(provider);
    
    console.log('Git Plugin: Extension activated successfully, provider registered');
    
    // Если workspace появится позже, обновим сервис
    if (!workspaceRoot) {
        const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0 && !workspaceRoot) {
                workspaceRoot = folders[0].uri.fsPath;
                workspaceRoot = folders[0].uri.fsPath;
                gitService = new GitService(workspaceRoot);
                if (gitViewProvider) {
                    gitViewProvider.setGitService(gitService);
                }
                console.log('Git Plugin: Workspace folder added, service updated');
            }
        });
        context.subscriptions.push(disposable);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.openView', () => {
            vscode.commands.executeCommand('gitPluginView.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.refresh', () => {
            gitViewProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.checkout', async (branch: string) => {
            try {
                await gitService.checkoutBranch(branch);
                gitViewProvider.refresh();
                vscode.window.showInformationMessage(`Switched to branch: ${branch}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to checkout branch: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.createBranch', async (fromBranch?: string) => {
            const branchName = await vscode.window.showInputBox({
                prompt: 'Enter new branch name',
                placeHolder: 'branch-name'
            });
            if (branchName) {
                try {
                    await gitService.createBranch(branchName, fromBranch);
                    gitViewProvider.refresh();
                    vscode.window.showInformationMessage(`Created branch: ${branchName}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.compare', async (branch1: string, branch2: string) => {
            const diff = await gitService.compareBranches(branch1, branch2);
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.showDiff', async (branch: string) => {
            const diff = await gitService.getWorkingTreeDiff(branch);
            const doc = await vscode.workspace.openTextDocument({
                content: diff,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.rebase', async (branch: string, onto: string) => {
            try {
                await gitService.rebase(branch, onto);
                gitViewProvider.refresh();
                vscode.window.showInformationMessage(`Rebased ${branch} onto ${onto}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to rebase: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.merge', async (branch: string, into: string) => {
            try {
                await gitService.merge(branch, into);
                gitViewProvider.refresh();
                vscode.window.showInformationMessage(`Merged ${branch} into ${into}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to merge: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.push', async (branch: string) => {
            try {
                await gitService.push(branch);
                gitViewProvider.refresh();
                vscode.window.showInformationMessage(`Pushed ${branch} to remote`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to push: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.pull', async (branch: string) => {
            try {
                await gitService.pull(branch);
                gitViewProvider.refresh();
                vscode.window.showInformationMessage(`Updated ${branch} from remote`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to pull: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.rename', async (branch: string) => {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new branch name',
                value: branch
            });
            if (newName) {
                await gitService.renameBranch(branch, newName);
                gitViewProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.delete', async (branch: string) => {
            const confirmed = await vscode.window.showWarningMessage(
                `Delete branch "${branch}"?`,
                { modal: true },
                'Delete'
            );
            if (confirmed === 'Delete') {
                await gitService.deleteBranch(branch);
                gitViewProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.cherryPick', async (commitHash: string) => {
            await gitService.cherryPick(commitHash);
            gitViewProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.revert', async (commitHash: string) => {
            await gitService.revert(commitHash);
            gitViewProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.reset', async (commitHash: string) => {
            const mode = await vscode.window.showQuickPick(
                ['soft', 'mixed', 'hard'],
                { placeHolder: 'Select reset mode' }
            );
            if (mode) {
                try {
                    await gitService.reset(commitHash, mode as 'soft' | 'mixed' | 'hard');
                    gitViewProvider.refresh();
                    vscode.window.showInformationMessage(`Reset to commit: ${commitHash.substring(0, 7)}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to reset: ${error}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitPlugin.copyRevision', async (commitHash: string) => {
            await vscode.env.clipboard.writeText(commitHash);
            vscode.window.showInformationMessage(`Copied revision: ${commitHash}`);
        })
    );
}

export function deactivate() {
    if (gitService) {
        gitService.dispose();
    }
}

