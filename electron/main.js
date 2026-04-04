const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron')
const path   = require('path')
const { spawn, execSync } = require('child_process')
const http   = require('http')
const { autoUpdater } = require('electron-updater')

const isDev  = process.env.NODE_ENV === 'development'
const PORT   = 3001
let backendProcess = null
let mainWindow     = null

// ── Start embedded Express backend ──────────────────────────────────────────
function startBackend() {
  const backendEntry = isDev
    ? path.join(__dirname, '../backend/src/app.js')
    : path.join(process.resourcesPath, 'backend/src/app.js')

  backendProcess = spawn('node', [backendEntry], {
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'production',
      DB_PATH: path.join(app.getPath('userData'), 'budget.db'),
      FRONTEND_URL: `http://localhost:${PORT}`,
      RESOURCES_PATH: process.resourcesPath,
    },
    stdio: isDev ? 'inherit' : 'pipe',
  })

  backendProcess.on('error', (err) => console.error('Backend error:', err))
  backendProcess.on('exit',  (code) => {
    if (code !== 0 && code !== null) console.error('Backend exited with code', code)
  })
}

// ── Wait for backend to be ready ─────────────────────────────────────────────
function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http.get(`http://localhost:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve()
        else retry(n)
      }).on('error', () => retry(n))
    }
    const retry = (n) => {
      if (n <= 0) return reject(new Error('Backend did not start'))
      setTimeout(() => check(n - 1), 300)
    }
    check(retries)
  })
}

// ── Create window ─────────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width:          1200,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    titleBarStyle:  'hiddenInset',
    backgroundColor: '#0e1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  // Custom menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'Budget',
      submenu: [
        { role: 'about', label: 'À propos' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils développeur' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom par défaut' },
        { role: 'zoomIn',    label: 'Zoom +' },
        { role: 'zoomOut',   label: 'Zoom -' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut',       label: 'Couper' },
        { role: 'copy',      label: 'Copier' },
        { role: 'paste',     label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadURL(`http://localhost:${PORT}`)
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-user-data-path', () => app.getPath('userData'))

// ── Auto-updater ──────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise à jour disponible',
      message: 'Une nouvelle version a été téléchargée.',
      detail: 'L\'application va redémarrer pour appliquer la mise à jour.',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (e) => console.error('[updater]', e.message))
  autoUpdater.checkForUpdatesAndNotify()
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // In dev, backend is started manually — don't spawn a second instance
  if (!isDev) {
    startBackend()
  }
  try {
    await waitForBackend()
    await createWindow()
    if (!isDev) setupAutoUpdater()
  } catch (e) {
    console.error('Startup failed:', e)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow()
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
})
