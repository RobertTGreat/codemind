export interface FileTreeNode {
  id: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

export interface ProjectFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  language: string;
}

export interface ProjectSearchResult {
  name: string;
  relativePath: string;
  parentPath: string;
  isDirectory: boolean;
}
