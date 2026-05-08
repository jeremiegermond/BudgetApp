const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron')
const path   = require('path')
const fs     = require('fs')
const { spawn } = require('child_process')
const http   = require('http')
const { autoUpdater } = require('electron-updater')

const isDev  = process.env.NODE_ENV === 'development'
const PORT   = 3001
let backendProcess = null
let mainWindow     = null

// ── Logging to file (for diagnosing fresh-install issues) ───────────────────
const logFile = path.join(app.getPath('userData'), 'budget-app.log')
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  try { fs.appendFileSync(logFile, line) } catch {}
  console.log(...args)
}
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err.stack || err.message)
})

// ── Start embedded Express backend ──────────────────────────────────────────
function startBackend() {
  const backendEntry = isDev
    ? path.join(__dirname, '../backend/src/app.js')
    : path.join(process.resourcesPath, 'backend/src/app.js')

  log('Starting backend:', backendEntry)
  log('Using runtime:', process.execPath)

  // Use Electron's bundled Node (ELECTRON_RUN_AS_NODE=1) so users don't need
  // a system Node.js installed. process.execPath points to the Electron binary.
  backendProcess = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT,
      NODE_ENV: 'production',
      DB_PATH: path.join(app.getPath('userData'), 'budget.db'),
      USER_DATA_PATH: app.getPath('userData'),
      FRONTEND_URL: `http://localhost:${PORT}`,
      RESOURCES_PATH: process.resourcesPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (d) => log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', (d) => log('[backend:err]', d.toString().trim()))
  backendProcess.on('error', (err) => log('Backend spawn error:', err.message))
  backendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) log('Backend exited with code', code)
  })
}

// ── Wait for backend to be ready ─────────────────────────────────────────────
function waitForBackend(retries = 50) {
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
ipcMain.handle('get-app-version', () => app.getVersion())

const CALLBACK_BASE = 'https://jeremiegermond.github.io/BudgetApp/callback'

ipcMain.handle('open-bank-auth', (event, url) => {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 900, height: 700,
      parent: mainWindow, modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    function tryCapture(navUrl) {
      if (!navUrl.startsWith(CALLBACK_BASE)) return false
      const params = new URL(navUrl).searchParams
      resolve({ code: params.get('code'), state: params.get('state') })
      setImmediate(() => authWin.close())
      return true
    }

    authWin.webContents.on('will-navigate',  (e, u) => { if (tryCapture(u)) e.preventDefault() })
    authWin.webContents.on('will-redirect',  (e, u) => { if (tryCapture(u)) e.preventDefault() })
    authWin.webContents.on('did-navigate',   (e, u) => tryCapture(u))

    authWin.on('closed', () => resolve(null))
    authWin.loadURL(url)
  })
})

// ── Auto-updater ──────────────────────────────────────────────────────────────
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} }

  autoUpdater.on('checking-for-update', () => send('updater:checking'))
  autoUpdater.on('update-available', (info) => {
    log('Update available:', info.version)
    send('updater:available', { version: info.version })
  })
  autoUpdater.on('update-not-available', () => send('updater:none'))
  autoUpdater.on('download-progress', (p) => {
    send('updater:progress', { percent: Math.round(p.percent || 0) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded:', info.version)
    send('updater:downloaded', { version: info.version })
  })
  autoUpdater.on('error', (e) => {
    log('[updater error]', e.message)
    send('updater:error', { message: e.message })
  })

  autoUpdater.checkForUpdates().catch(e => log('[updater] initial check failed:', e.message))
  // Re-check every 4 hours while app stays open
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(e => log('[updater] periodic check failed:', e.message))
  }, 4 * 60 * 60 * 1000)
}

ipcMain.handle('updater:check', async () => {
  try {
    const r = await autoUpdater.checkForUpdates()
    return { ok: true, version: r?.updateInfo?.version || null }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('updater:install', () => {
  setImmediate(() => autoUpdater.quitAndInstall())
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log(`Budget App v${app.getVersion()} starting (isDev=${isDev})`)
  if (!isDev) {
    startBackend()
  }
  try {
    await waitForBackend()
    await createWindow()
    if (!isDev) setupAutoUpdater()
  } catch (e) {
    log('Startup failed:', e.message)
    dialog.showErrorBox(
      'Échec du démarrage',
      `Le serveur interne n'a pas pu démarrer.\n\n${e.message}\n\nLogs : ${logFile}`
    )
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
