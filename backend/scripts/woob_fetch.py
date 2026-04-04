#!/usr/bin/env python3
"""
woob_fetch.py — Récupère les transactions via Woob
Usage: python3 woob_fetch.py <action> [args_json]

Actions:
  list_backends             → JSON list of supported backends
  check  <config_json>      → test connection, returns { ok, accounts }
  fetch  <config_json>      → fetch transactions, returns { transactions }

config_json = {
  "backend":  "cragr",          # woob module name
  "login":    "12345678",
  "password": "monmdp",
  "extra":    { ... }           # optional extra params (e.g. website for CA)
}
"""

import sys
import json
from datetime import datetime, timedelta

# Save real stdout before any redirection
_real_stdout = sys.stdout

def emit(data):
  """Write final JSON result to the real stdout."""
  _real_stdout.write(json.dumps(data) + '\n')
  _real_stdout.flush()

def log(msg):
  """Write a progress message to stderr (streamed to the frontend)."""
  sys.stderr.write(msg + '\n')
  sys.stderr.flush()

# ── Supported backends ────────────────────────────────────────────────────────
BACKENDS = [
  { "id": "cragr",            "name": "Crédit Agricole",       "extra_fields": [{"key": "website", "label": "Région (ex: www.ca-paris.fr)", "type": "text"}] },
  { "id": "bnporc",           "name": "BNP Paribas",           "extra_fields": [] },
  { "id": "societegenerale",  "name": "Société Générale",      "extra_fields": [] },
  { "id": "lcl",              "name": "LCL",                   "extra_fields": [] },
  { "id": "boursorama",       "name": "Boursorama",            "extra_fields": [] },
  { "id": "labanquepostale",  "name": "La Banque Postale",     "extra_fields": [] },
  { "id": "bred",             "name": "BRED",                  "extra_fields": [] },
  { "id": "hsbc",             "name": "HSBC France",           "extra_fields": [] },
  { "id": "hellobank",        "name": "Hello Bank",            "extra_fields": [] },
  { "id": "fortuneo",         "name": "Fortuneo",              "extra_fields": [] },
  { "id": "ing",              "name": "ING Direct",            "extra_fields": [] },
  { "id": "n26",              "name": "N26",                   "extra_fields": [] },
  { "id": "revolut",          "name": "Revolut",               "extra_fields": [] },
  { "id": "creditdunord",     "name": "Crédit du Nord",        "extra_fields": [] },
  { "id": "cmso",             "name": "Crédit Mutuel du Sud-Ouest", "extra_fields": [] },
  { "id": "cic",              "name": "CIC",                   "extra_fields": [] },
  { "id": "creditmutuel",     "name": "Crédit Mutuel",         "extra_fields": [] },
  { "id": "caissedepargne",   "name": "Caisse d'Épargne",      "extra_fields": [{"key": "nuser", "label": "Numéro utilisateur", "type": "text"}] },
  { "id": "banquepopulaire",  "name": "Banque Populaire",      "extra_fields": [] },
  { "id": "paypal",           "name": "PayPal",                "extra_fields": [] },
]

def check_woob_installed():
  try:
    import importlib.util
    spec = importlib.util.find_spec('woob')
    if spec is None:
      return False
    import woob
    return True
  except Exception:
    return False

def build_woob_config(cfg):
  backend = cfg["backend"]
  params  = { "login": cfg["login"], "password": cfg["password"] }
  if "extra" in cfg and cfg["extra"]:
    params.update(cfg["extra"])
  return backend, params

def do_list_backends():
  installed = check_woob_installed()
  emit({ "backends": BACKENDS, "woob_installed": installed })

def do_check(cfg):
  if not check_woob_installed():
    emit({ "ok": False, "error": "Woob n'est pas installé. Lancez: pip install woob" })
    return

  # Redirect stdout so woob's internal prints go to stderr (visible as progress)
  sys.stdout = sys.stderr
  try:
    log("Chargement du module bancaire...")
    from woob.core import Woob

    w = Woob()
    backend_name, params = build_woob_config(cfg)

    log(f"Connexion à {backend_name}...")
    w.load_or_install_module(backend_name)
    backend_inst = w.build_backend(backend_name, params)

    log("Récupération des comptes...")
    accounts = []
    for acc in backend_inst.iter_accounts():
      accounts.append({
        "id":      str(acc.id),
        "label":   str(acc.label),
        "balance": float(acc.balance) if acc.balance else 0,
        "type":    str(acc.type),
      })

    backend_inst.deinit()
    log(f"{len(accounts)} compte(s) trouvé(s)")
    result = { "ok": True, "accounts": accounts }
  except Exception as e:
    result = { "ok": False, "error": str(e) }
  finally:
    sys.stdout = _real_stdout

  emit(result)

def do_fetch(cfg):
  if not check_woob_installed():
    emit({ "ok": False, "error": "Woob n'est pas installé. Lancez: pip install woob", "transactions": [] })
    return

  # Redirect stdout so woob's internal prints go to stderr (visible as progress)
  sys.stdout = sys.stderr
  try:
    log("Chargement du module bancaire...")
    from woob.core import Woob

    date_from = datetime.now() - timedelta(days=int(cfg.get("days", 90)))
    w = Woob()
    backend_name, params = build_woob_config(cfg)

    log(f"Connexion à {backend_name}...")
    w.load_or_install_module(backend_name)
    backend_inst = w.build_backend(backend_name, params)

    log("Récupération des comptes...")
    accounts = list(backend_inst.iter_accounts())
    log(f"{len(accounts)} compte(s) trouvé(s)")

    transactions = []
    for i, acc in enumerate(accounts):
      log(f"Récupération des opérations — {acc.label} ({i + 1}/{len(accounts)})...")
      try:
        for tx in backend_inst.iter_history(acc):
          if tx.date and tx.date < date_from.date():
            continue
          transactions.append({
            "id":     str(tx.id) if tx.id else None,
            "label":  str(tx.label or tx.raw or "Opération"),
            "amount": float(tx.amount),
            "date":   tx.date.isoformat() if tx.date else datetime.now().date().isoformat(),
          })
      except Exception:
        pass  # Skip accounts that fail (e.g. savings with no history)

    backend_inst.deinit()
    log(f"{len(transactions)} opération(s) récupérée(s)")
    result = { "ok": True, "transactions": transactions }
  except Exception as e:
    result = { "ok": False, "error": f"{type(e).__name__}: {e}", "transactions": [] }
  finally:
    sys.stdout = _real_stdout

  emit(result)

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
  action = sys.argv[1] if len(sys.argv) > 1 else "list_backends"

  if action == "list_backends":
    do_list_backends()
  elif action == "check" and len(sys.argv) > 2:
    do_check(json.loads(sys.argv[2]))
  elif action == "fetch" and len(sys.argv) > 2:
    do_fetch(json.loads(sys.argv[2]))
  else:
    emit({ "error": f"Action inconnue: {action}" })
    sys.exit(1)
