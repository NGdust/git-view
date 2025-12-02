import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);

export interface GitBranch {
  name: string;
  current: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  isMerge: boolean;
  parents: string[];
}

export interface GitCommitDetails {
  hash: string;
  files: string[];
}

export class GitService {
  constructor(private readonly workspaceFolder: vscode.Uri | undefined) {}

  private get cwd(): string | undefined {
    return this.workspaceFolder?.fsPath;
  }

  public async isGitRepo(): Promise<boolean> {
    if (!this.cwd) {
      return false;
    }
    try {
      await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: this.cwd,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async getBranches(): Promise<GitBranch[]> {
    if (!(await this.isGitRepo())) {
      return [];
    }

    const { stdout } = await execFileAsync(
      "git",
      ["branch", "--format=%(refname:short)|%(HEAD)"],
      { cwd: this.cwd },
    );

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, headFlag] = line.split("|");
        return {
          name,
          current: headFlag === "*",
        };
      });
  }

  public async getCommits(branch: string, maxCount = 50): Promise<GitCommit[]> {
    if (!(await this.isGitRepo())) {
      return [];
    }

    const format = [
      "%H", // hash
      "%h", // short hash
      "%an", // author name
      "%ai", // author date (ISO, с таймзоной)
      "%s", // subject
      "%P", // parents hashes
    ].join("%x1f");

    const { stdout } = await execFileAsync(
      "git",
      [
        "log",
        branch,
        `--max-count=${maxCount}`,
        `--pretty=format:${format}%x1e`,
      ],
      {
        cwd: this.cwd,
      },
    );

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .split("\x1e")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [hash, shortHash, author, date, subject, parentsRaw] =
          entry.split("\x1f");
        const parentsList = (parentsRaw || "").trim();
        const parents = parentsList
          ? parentsList.split(" ").filter((p) => p.length > 0)
          : [];
        const isMerge = parents.length > 1;
        return { hash, shortHash, author, date, subject, isMerge, parents };
      });
  }

  public async checkoutBranch(branch: string): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    await execFileAsync("git", ["checkout", branch], { cwd: this.cwd });
  }

  public async createBranchFrom(
    sourceBranch: string,
    newBranch: string,
  ): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    await execFileAsync("git", ["checkout", sourceBranch], { cwd: this.cwd });
    await execFileAsync("git", ["checkout", "-b", newBranch], {
      cwd: this.cwd,
    });
  }

  public async deleteBranch(branch: string): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    await execFileAsync("git", ["branch", "-d", branch], { cwd: this.cwd });
  }

  public async resetToCommit(hash: string): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    await execFileAsync("git", ["reset", "--hard", hash], { cwd: this.cwd });
  }

  public async changeLastCommitMessage(message: string): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    await execFileAsync("git", ["commit", "--amend", "-m", message], {
      cwd: this.cwd,
    });
  }

  public async cherryPickCommits(hashes: string[]): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd || hashes.length === 0) {
      return;
    }

    await execFileAsync("git", ["cherry-pick", ...hashes], { cwd: this.cwd });
  }

  public async squashCommits(
    oldestHash: string,
    message: string,
  ): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    // Схема: soft reset к коммиту перед самым старым и новый коммит с указанным сообщением
    await execFileAsync("git", ["reset", "--soft", `${oldestHash}^`], {
      cwd: this.cwd,
    });
    await execFileAsync("git", ["commit", "-m", message], { cwd: this.cwd });
  }

  public async pullBranch(branch: string): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    // Для надёжности переходим на ветку и выполняем обычный pull
    await execFileAsync("git", ["checkout", branch], { cwd: this.cwd });
    await execFileAsync("git", ["pull"], { cwd: this.cwd });
  }

  public async pushBranch(branch: string, force = false): Promise<void> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return;
    }

    const args = force
      ? ["push", "--force-with-lease", "-u", "origin", branch]
      : ["push", "-u", "origin", branch];

    // Пытаемся отправить ветку на origin, создавая tracking при необходимости
    await execFileAsync("git", args, {
      cwd: this.cwd,
    });
  }

  public async getUnpushedCommits(
    branch: string,
    maxCount = 50,
  ): Promise<GitCommit[]> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return [];
    }

    const format = [
      "%H", // hash
      "%h", // short hash
      "%an", // author name
      "%ai", // author date
      "%s", // subject
      "%P", // parents
    ].join("%x1f");

    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          branch,
          "--not",
          "--remotes",
          `--max-count=${maxCount}`,
          `--pretty=format:${format}%x1e`,
        ],
        { cwd: this.cwd },
      );

      if (!stdout.trim()) {
        return [];
      }

      return stdout
        .split("\x1e")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [hash, shortHash, author, date, subject, parentsRaw] =
            entry.split("\x1f");
          const parentsList = (parentsRaw || "").trim();
          const parents = parentsList
            ? parentsList.split(" ").filter((p) => p.length > 0)
            : [];
          const isMerge = parents.length > 1;
          return { hash, shortHash, author, date, subject, isMerge, parents };
        });
    } catch {
      // если произошла ошибка, считаем, что непушенных коммитов нет
      return [];
    }
  }

  public async getCommitDetails(hash: string): Promise<GitCommitDetails> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return { hash, files: [] };
    }

    const { stdout } = await execFileAsync(
      "git",
      ["show", "--name-only", "--pretty=format:", hash],
      { cwd: this.cwd },
    );

    const files = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return { hash, files };
  }

  public async getDiffForFile(hash: string, filePath: string): Promise<string> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return "";
    }

    const { stdout } = await execFileAsync(
      "git",
      ["show", hash, "--", filePath],
      { cwd: this.cwd },
    );

    return stdout;
  }

  public async getFileContentAt(ref: string, filePath: string): Promise<string> {
    if (!(await this.isGitRepo()) || !this.cwd) {
      return "";
    }

    const { stdout } = await execFileAsync(
      "git",
      ["show", `${ref}:${filePath}`],
      { cwd: this.cwd },
    );

    return stdout;
  }
}







