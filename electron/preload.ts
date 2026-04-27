import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

contextBridge.exposeInMainWorld("codeForgeAI", {
  loadModels(request: unknown) {
    return ipcRenderer.invoke("ai:load-models", request);
  },

  sendChat(request: unknown) {
    return ipcRenderer.invoke("ai:send-chat", request);
  },

  streamChat(request: unknown) {
    const streamId = createId();

    return {
      id: streamId,
      cancel() {
        void ipcRenderer.invoke("ai:cancel-stream", streamId);
      },
      result(onDelta: (event: unknown) => void) {
        const channel = `ai:stream-delta:${streamId}`;
        const listener = (_event: IpcRendererEvent, payload: unknown) => {
          onDelta(payload);
        };

        ipcRenderer.on(channel, listener);

        return ipcRenderer
          .invoke("ai:stream-chat", streamId, request)
          .finally(() => {
            ipcRenderer.removeListener(channel, listener);
          });
      },
    };
  },
});
