"use strict";
const electron = require("electron");
function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
electron.contextBridge.exposeInMainWorld("codeForgeAI", {
  loadModels(request) {
    return electron.ipcRenderer.invoke("ai:load-models", request);
  },
  sendChat(request) {
    return electron.ipcRenderer.invoke("ai:send-chat", request);
  },
  streamChat(request) {
    const streamId = createId();
    return {
      id: streamId,
      cancel() {
        void electron.ipcRenderer.invoke("ai:cancel-stream", streamId);
      },
      result(onDelta) {
        const channel = `ai:stream-delta:${streamId}`;
        const listener = (_event, payload) => {
          onDelta(payload);
        };
        electron.ipcRenderer.on(channel, listener);
        return electron.ipcRenderer.invoke("ai:stream-chat", streamId, request).finally(() => {
          electron.ipcRenderer.removeListener(channel, listener);
        });
      }
    };
  }
});
