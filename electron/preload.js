const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  openBankAuth:    (url) => ipcRenderer.invoke('open-bank-auth', url),

  updater: {
    check:   () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    on: (event, cb) => {
      const channel = `updater:${event}`
      const listener = (_e, payload) => cb(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },

  isElectron: true,
})
