/**
 * File System Access API → isomorphic-git fs 适配器
 * 让 isomorphic-git 在浏览器中直接读取用户本地目录的 .git 仓库
 */

interface FsEntry {
  name: string;
  kind: "file" | "directory";
}

interface FsStats {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** 将 '/' 分隔的路径逐级解析到 FileSystemHandle */
async function resolveHandle(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length === 0) return root;

  let handle: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) {
      // 最后一段：先尝试文件，再尝试目录
      try {
        return await handle.getFileHandle(part);
      } catch {
        try {
          return await handle.getDirectoryHandle(part);
        } catch {
          throw new Error(`Path not found: ${part} in ${filePath}`);
        }
      }
    } else {
      // 中间段：必须是目录
      try {
        handle = await handle.getDirectoryHandle(part);
      } catch {
        throw new Error(`Directory not found: ${part} in ${filePath}`);
      }
    }
  }
  return handle;
}

/** 读取目录内容 */
async function readdirImpl(
  root: FileSystemDirectoryHandle,
  dirPath: string
): Promise<string[]> {
  const handle = await resolveHandle(root, dirPath);
  if (handle.kind !== "directory") {
    throw new Error(`Not a directory: ${dirPath}`);
  }
  const entries: string[] = [];
  for await (const [name] of handle) {
    entries.push(name);
  }
  return entries;
}

export function createHandleFS(rootHandle: FileSystemDirectoryHandle) {
  return {
    readFile: async (
      filePath: string,
      opts?: { encoding?: string }
    ): Promise<Uint8Array | string> => {
      const handle = (await resolveHandle(
        rootHandle,
        filePath
      )) as FileSystemFileHandle;
      const file = await handle.getFile();
      if (opts?.encoding === "utf8") {
        return await file.text();
      }
      const buf = await file.arrayBuffer();
      return new Uint8Array(buf);
    },

    writeFile: async (_filePath: string, _data: any): Promise<void> => {
      throw new Error("writeFile not implemented");
    },

    unlink: async (_filePath: string): Promise<void> => {
      throw new Error("unlink not implemented");
    },

    readdir: async (dirPath: string): Promise<string[]> => {
      return readdirImpl(rootHandle, dirPath);
    },

    mkdir: async (_dirPath: string): Promise<void> => {
      throw new Error("mkdir not implemented");
    },

    rmdir: async (_dirPath: string): Promise<void> => {
      throw new Error("rmdir not implemented");
    },

    stat: async (filePath: string): Promise<FsStats> => {
      try {
        const handle = await resolveHandle(rootHandle, filePath);
        return {
          isFile: () => handle.kind === "file",
          isDirectory: () => handle.kind === "directory",
          isSymbolicLink: () => false,
        };
      } catch {
        throw new Error(`stat failed: ${filePath}`);
      }
    },

    lstat: async (filePath: string): Promise<FsStats> => {
      // lstat = stat for our purposes (no symlinks in browser)
      try {
        const handle = await resolveHandle(rootHandle, filePath);
        return {
          isFile: () => handle.kind === "file",
          isDirectory: () => handle.kind === "directory",
          isSymbolicLink: () => false,
        };
      } catch {
        throw new Error(`lstat failed: ${filePath}`);
      }
    },

    readlink: async (_filePath: string): Promise<string> => {
      throw new Error("readlink not implemented");
    },

    symlink: async (_target: string, _path: string): Promise<void> => {
      throw new Error("symlink not implemented");
    },
  };
}

/** 扫描目录下的所有 git 仓库 */
export async function findGitRepos(
  rootHandle: FileSystemDirectoryHandle
): Promise<
  { name: string; handle: FileSystemDirectoryHandle; branch: string }[]
> {
  const repos: { name: string; handle: FileSystemDirectoryHandle; branch: string }[] = [];

  for await (const [name, handle] of rootHandle) {
    if (handle.kind !== "directory") continue;
    // 检查是否有 .git 子目录
    try {
      const gitHandle = await handle.getDirectoryHandle(".git");
      // 尝试读取 HEAD 来获取当前分支
      let branch = "unknown";
      try {
        const headFile = await gitHandle.getFileHandle("HEAD");
        const headContent = await (await headFile.getFile()).text();
        const refMatch = headContent.match(/ref: refs\/heads\/(.+)/);
        if (refMatch) branch = refMatch[1].trim();
        else branch = headContent.trim().slice(0, 7); // detached HEAD hash
      } catch { /* ignore */ }
      repos.push({ name, handle, branch });
    } catch {
      // 没有 .git，跳过
    }
  }
  return repos;
}
