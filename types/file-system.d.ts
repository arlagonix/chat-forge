interface FileSystemHandle {
  kind: "file" | "directory"
  name: string
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: "file"
  getFile(): Promise<File>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: "directory"
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
}

interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>
}

interface File {
  webkitRelativePath: string
}

interface HTMLInputElement {
  webkitdirectory?: boolean
}

interface FileSystemEntry {
  readonly isFile: boolean
  readonly isDirectory: boolean
  readonly name: string
  readonly fullPath: string
}

interface FileSystemFileEntry extends FileSystemEntry {
  readonly isFile: true
  readonly isDirectory: false
  file(successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void): void
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  readonly isFile: false
  readonly isDirectory: true
  createReader(): FileSystemDirectoryReader
}

interface FileSystemDirectoryReader {
  readEntries(successCallback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: DOMException) => void): void
}

interface DataTransferItem {
  webkitGetAsEntry?(): FileSystemEntry | null
}

