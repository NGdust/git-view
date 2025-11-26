import simpleGit, { SimpleGit, BranchSummary, LogResult } from 'simple-git';

export interface BranchInfo {
    name: string;
    current: boolean;
    remote?: string;
    ahead?: number;
    behind?: number;
}

export interface CommitInfo {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    branches: string[];
    tags: string[];
    parents: string[];
}

export class GitService {
    private git: SimpleGit;
    private disposed = false;

    constructor(private workspaceRoot: string) {
        this.git = simpleGit({ baseDir: workspaceRoot });
    }

    async getBranches(): Promise<{ local: BranchInfo[]; remote: BranchInfo[] }> {
        try {
            const branchSummary: BranchSummary = await this.git.branch(['-a']);
            const currentBranch = branchSummary.current;

            const local: BranchInfo[] = [];
            const remote: BranchInfo[] = [];

            for (const [name, branch] of Object.entries(branchSummary.branches)) {
                const branchInfo: BranchInfo = {
                    name: branch.name,
                    current: branch.current || false
                };
                
                // Получаем ahead/behind через git status
                if (branch.current) {
                    try {
                        const status = await this.git.status();
                        branchInfo.ahead = status.ahead;
                        branchInfo.behind = status.behind;
                    } catch {
                        // Игнорируем ошибки получения статуса
                    }
                }

                if (branch.name.startsWith('remotes/')) {
                    branchInfo.name = branch.name.replace('remotes/', '');
                    branchInfo.remote = branch.name.split('/')[1];
                    remote.push(branchInfo);
                } else {
                    local.push(branchInfo);
                }
            }

            return { local, remote };
        } catch (error) {
            console.error('Error getting branches:', error);
            return { local: [], remote: [] };
        }
    }

    async getCommits(limit: number = 100): Promise<CommitInfo[]> {
        try {
            const log: LogResult = await this.git.log({
                maxCount: limit,
                multiLine: false
            });

            const commits: CommitInfo[] = log.all.map((commit) => ({
                hash: commit.hash,
                shortHash: commit.hash.substring(0, 7),
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date).toLocaleString('ru-RU'),
                branches: [],
                tags: [],
                parents: (commit as any).parents || []
            }));

            const branchSummary = await this.git.branch(['-a']);

            for (const commit of commits) {
                for (const [branchName, branch] of Object.entries(branchSummary.branches)) {
                    if (branch.commit === commit.hash) {
                        if (branchName.startsWith('remotes/')) {
                            commit.branches.push(branchName.replace('remotes/', ''));
                        } else {
                            commit.branches.push(branchName);
                        }
                    }
                }
            }

            // Получаем теги асинхронно для оптимизации
            try {
                const tags = await this.git.tags();
                const tagPromises = tags.all.map(async (tag) => {
                    try {
                        const tagCommit = await this.git.revparse([tag]);
                        return { tag, commit: tagCommit.trim() };
                    } catch {
                        return null;
                    }
                });
                const tagResults = await Promise.all(tagPromises);
                
                const tagMap = new Map<string, string[]>();
                tagResults.forEach(result => {
                    if (result) {
                        if (!tagMap.has(result.commit)) {
                            tagMap.set(result.commit, []);
                        }
                        tagMap.get(result.commit)!.push(result.tag);
                    }
                });

                commits.forEach(commit => {
                    const commitTags = tagMap.get(commit.hash);
                    if (commitTags) {
                        commit.tags.push(...commitTags);
                    }
                });
            } catch (error) {
                console.error('Error getting tags:', error);
            }

            return commits;
        } catch (error) {
            console.error('Error getting commits:', error);
            return [];
        }
    }

    async getCommitGraph(): Promise<{ commits: CommitInfo[]; graph: string }> {
        try {
            const commits = await this.getCommits(100);
            const graph = commits.map(c => c.hash).join('\n');
            return {
                commits,
                graph
            };
        } catch (error) {
            console.error('Error getting commit graph:', error);
            return { commits: [], graph: '' };
        }
    }

    async checkoutBranch(branch: string): Promise<void> {
        try {
            await this.git.checkout(branch);
        } catch (error) {
            throw new Error(`Failed to checkout branch: ${error}`);
        }
    }

    async createBranch(name: string, fromBranch?: string): Promise<void> {
        try {
            if (fromBranch) {
                await this.git.checkoutBranch(name, fromBranch);
            } else {
                await this.git.checkoutLocalBranch(name);
            }
        } catch (error) {
            throw new Error(`Failed to create branch: ${error}`);
        }
    }

    async compareBranches(branch1: string, branch2: string): Promise<string> {
        try {
            return await this.git.diff([branch1, branch2]);
        } catch (error) {
            throw new Error(`Failed to compare branches: ${error}`);
        }
    }

    async getWorkingTreeDiff(branch: string): Promise<string> {
        try {
            return await this.git.diff([branch, 'HEAD']);
        } catch (error) {
            throw new Error(`Failed to get diff: ${error}`);
        }
    }

    async rebase(branch: string, onto: string): Promise<void> {
        try {
            await this.git.checkout(branch);
            await this.git.rebase([onto]);
        } catch (error) {
            throw new Error(`Failed to rebase: ${error}`);
        }
    }

    async merge(branch: string, into: string): Promise<void> {
        try {
            await this.git.checkout(into);
            await this.git.merge([branch]);
        } catch (error) {
            throw new Error(`Failed to merge: ${error}`);
        }
    }

    async push(branch: string): Promise<void> {
        try {
            await this.git.push('origin', branch);
        } catch (error) {
            throw new Error(`Failed to push: ${error}`);
        }
    }

    async pull(branch: string): Promise<void> {
        try {
            await this.git.pull('origin', branch);
        } catch (error) {
            throw new Error(`Failed to pull: ${error}`);
        }
    }

    async renameBranch(oldName: string, newName: string): Promise<void> {
        try {
            await this.git.raw(['branch', '-m', oldName, newName]);
        } catch (error) {
            throw new Error(`Failed to rename branch: ${error}`);
        }
    }

    async deleteBranch(branch: string): Promise<void> {
        try {
            await this.git.deleteLocalBranch(branch);
        } catch (error) {
            throw new Error(`Failed to delete branch: ${error}`);
        }
    }

    async cherryPick(commitHash: string): Promise<void> {
        try {
            await this.git.raw(['cherry-pick', commitHash]);
        } catch (error) {
            throw new Error(`Failed to cherry-pick: ${error}`);
        }
    }

    async revert(commitHash: string): Promise<void> {
        try {
            await this.git.revert(commitHash, ['--no-edit']);
        } catch (error) {
            throw new Error(`Failed to revert: ${error}`);
        }
    }

    async reset(commitHash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
        try {
            await this.git.reset([`--${mode}`, commitHash]);
        } catch (error) {
            throw new Error(`Failed to reset: ${error}`);
        }
    }

    async getTags(): Promise<string[]> {
        try {
            const tags = await this.git.tags();
            return tags.all;
        } catch (error) {
            console.error('Error getting tags:', error);
            return [];
        }
    }

    dispose(): void {
        this.disposed = true;
    }
}

