const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  openBankAuth:   (url) => ipcRenderer.invoke('open-bank-auth', url),
  isElectron: true,
})
