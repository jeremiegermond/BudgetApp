const { execFile, execFileSync, spawn } = require('child_process')
const path = require('path')

const SCRIPT = path.join(__dirname, '../../scripts/woob_fetch.py')

const FALLBACK_BACKENDS = [
  { id: 'cragr',           name: 'Crédit Agricole',       extra_fields: [{ key: 'website', label: 'Région (ex: www.ca-paris.fr)', type: 'text' }] },
  { id: 'bnporc',          name: 'BNP Paribas',           extra_fields: [] },
  { id: 'societegenerale', name: 'Société Générale',      extra_fields: [] },
  { id: 'lcl',             name: 'LCL',                   extra_fields: [] },
  { id: 'boursorama',      name: 'Boursorama',            extra_fields: [] },
  { id: 'labanquepostale', name: 'La Banque Postale',     extra_fields: [] },
  { id: 'bred',            name: 'BRED',                  extra_fields: [] },
  { id: 'hellobank',       name: 'Hello Bank',            extra_fields: [] },
  { id: 'fortuneo',        name: 'Fortuneo',              extra_fields: [] },
  { id: 'ing',             name: 'ING Direct',            extra_fields: [] },
  { id: 'n26',             name: 'N26',                   extra_fields: [] },
  { id: 'revolut',         name: 'Revolut',               extra_fields: [] },
  { id: 'cic',             name: 'CIC',                   extra_fields: [] },
  { id: 'creditmutuel',    name: 'Crédit Mutuel',         extra_fields: [] },
  { id: 'caissedepargne',  name: "Caisse d'Épargne",      extra_fields: [{ key: 'nuser', label: 'Numéro utilisateur', type: 'text' }] },
  { id: 'banquepopulaire', name: 'Banque Populaire',      extra_fields: [] },
  { id: 'hsbc',            name: 'HSBC France',           extra_fields: [] },
  { id: 'paypal',          name: 'PayPal',                extra_fields: [] },
]

// Convert a Windows path to a WSL-compatible /mnt/x/... path
function toWslPath(winPath) {
  return winPath
    .replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
    .replace(/\\/g, '/')
}

// Returns { cmd, prefix, script } — prefix are extra args before the script (e.g. ['python3'] for WSL)
function detectPython() {
  // On Windows, try WSL first — native Windows Python has GPG issues with woob
  if (process.platform === 'win32') {
    try {
      execFileSync('wsl', ['python3', '-c', 'import woob'], { timeout: 8000, stdio: 'pipe' })
      const wslScript = toWslPath(SCRIPT)
      console.log(`[woob] WSL python3 (woob found), script: ${wslScript}`)
      return { cmd: 'wsl', prefix: ['python3'], script: wslScript }
    } catch {}
  }

  // Try native python3 / python
  for (const cmd of ['python3', 'python']) {
    try {
      const v = execFileSync(cmd, ['--version'], { timeout: 3000, stdio: 'pipe' }).toString()
      if (v.includes('Python 3')) { console.log(`[woob] Native: ${cmd}`); return { cmd, prefix: [], script: SCRIPT } }
    } catch (e) {
      const v = e.stderr?.toString() || ''
      if (v.includes('Python 3')) { console.log(`[woob] Native: ${cmd}`); return { cmd, prefix: [], script: SCRIPT } }
    }
  }

  // WSL fallback even if woob not detected (will fail gracefully at runtime)
  try {
    const v = execFileSync('wsl', ['python3', '--version'], { timeout: 5000, stdio: 'pipe' }).toString()
    if (v.includes('Python 3')) {
      const wslScript = toWslPath(SCRIPT)
      console.log(`[woob] WSL python3 (fallback), script: ${wslScript}`)
      return { cmd: 'wsl', prefix: ['python3'], script: wslScript }
    }
  } catch {}

  console.log('[woob] Fallback: python')
  return { cmd: 'python', prefix: [], script: SCRIPT }
}

const PY = detectPython()

function buildArgs(action, arg) {
  const tail = arg ? [PY.script, action, JSON.stringify(arg)] : [PY.script, action]
  return [...PY.prefix, ...tail]
}

// ── Non-streaming: used for list_backends and check ──────────────────────────

function runPython(action, arg) {
  return new Promise((resolve, reject) => {
    execFile(PY.cmd, buildArgs(action, arg), { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message))
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim())
        const lastLine = lines[lines.length - 1] || '{}'
        resolve(JSON.parse(lastLine))
      } catch (e) {
        reject(new Error(`Python parse error: ${stdout} / ${stderr}`))
      }
    })
  })
}

// ── Streaming: used for fetch (relays stderr lines as progress) ───────────────

function spawnPython(action, arg, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(PY.cmd, buildArgs(action, arg))

    let stdout = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Timeout : opération trop longue (> 5 min)'))
    }, 300_000)

    child.stdout.on('data', d => { stdout += d })

    child.stderr.on('data', d => {
      const lines = d.toString().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) onProgress && onProgress(trimmed)
      }
    })

    child.on('close', () => {
      clearTimeout(timer)
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim())
        const lastLine = lines[lines.length - 1] || '{}'
        resolve(JSON.parse(lastLine))
      } catch (e) {
        reject(new Error(`Python parse error: ${stdout}`))
      }
    })

    child.on('error', e => { clearTimeout(timer); reject(e) })
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

async function listBackends() {
  try {
    return await runPython('list_backends')
  } catch {
    return { backends: FALLBACK_BACKENDS, woob_installed: false }
  }
}

async function checkConnection(config) {
  return runPython('check', config)
}

async function fetchTransactions(config, days = 90) {
  return runPython('fetch', { ...config, days })
}

async function fetchTransactionsStream(config, days = 90, onProgress) {
  return spawnPython('fetch', { ...config, days }, onProgress)
}

module.exports = { listBackends, checkConnection, fetchTransactions, fetchTransactionsStream, FALLBACK_BACKENDS }
