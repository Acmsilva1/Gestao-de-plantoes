#!/usr/bin/env python3
"""
Pipeline Guard

Monitora mudancas no projeto e executa validacoes.
Gera logs estruturados e um relatorio visual com sugestoes de correcao.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Dict, Iterable, List, Tuple


DEFAULT_CONFIG = {
    "watch_roots": [
        "api",
        "web/src",
        "package.json",
        "api/package.json",
        "doc/documentacao.md",
    ],
    "ignore_globs": [
        ".git/*",
        "node_modules/*",
        "web/node_modules/*",
        "web/dist/*",
        "dist/*",
        ".codex-logs/*",
        "pipeline_guard_logs/*",
    ],
    "scan_files_for_encoding": [
        "web/src/views/ManagerVisaoAnaliticaPage.jsx",
        "web/src/views/ManagerDashboardPage.jsx",
        "web/src/views/ManagerRelatoriosPage.jsx",
        "api/controllers/ManagerService.js",
        "api/services/CronService.js",
        "web/src/models/api.js",
    ],
    "encoding_bad_patterns": [
        "Ã¡",
        "Ã¢",
        "Ã£",
        "Ã§",
        "Ã©",
        "Ãª",
        "Ã­",
        "Ã³",
        "Ã´",
        "Ãµ",
        "Ãº",
        "Ã ",
        "Â",
        "ï¿½",
    ],
    "commands": [
        {
            "name": "api_syntax_manager_service",
            "cmd": ["node", "--check", "api/controllers/ManagerService.js"],
            "cwd": ".",
        },
        {
            "name": "api_syntax_cron_service",
            "cmd": ["node", "--check", "api/services/CronService.js"],
            "cwd": ".",
        },
        {
            "name": "web_build",
            "cmd": ["npm", "run", "build"],
            "cwd": ".",
        },
    ],
}


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        config_path.write_text(
            json.dumps(DEFAULT_CONFIG, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return DEFAULT_CONFIG
    with config_path.open("r", encoding="utf-8-sig") as f:
        data = json.load(f)
    merged = dict(DEFAULT_CONFIG)
    merged.update(data or {})
    return merged


def is_ignored(rel_path: str, ignore_globs: Iterable[str]) -> bool:
    normalized = rel_path.replace("\\", "/")
    for pattern in ignore_globs:
        if fnmatch.fnmatch(normalized, pattern):
            return True
    return False


def iter_watch_files(root: Path, watch_roots: Iterable[str], ignore_globs: Iterable[str]) -> Iterable[Path]:
    for item in watch_roots:
        target = root / item
        if not target.exists():
            continue
        if target.is_file():
            rel = str(target.relative_to(root))
            if not is_ignored(rel, ignore_globs):
                yield target
            continue
        for p in target.rglob("*"):
            if not p.is_file():
                continue
            rel = str(p.relative_to(root))
            if is_ignored(rel, ignore_globs):
                continue
            yield p


def snapshot_state(root: Path, watch_roots: Iterable[str], ignore_globs: Iterable[str]) -> Dict[str, Tuple[int, int]]:
    state: Dict[str, Tuple[int, int]] = {}
    for p in iter_watch_files(root, watch_roots, ignore_globs):
        rel = str(p.relative_to(root)).replace("\\", "/")
        st = p.stat()
        state[rel] = (int(st.st_mtime_ns), int(st.st_size))
    return state


def diff_snapshots(prev: Dict[str, Tuple[int, int]], curr: Dict[str, Tuple[int, int]]) -> dict:
    prev_keys = set(prev)
    curr_keys = set(curr)
    added = sorted(curr_keys - prev_keys)
    removed = sorted(prev_keys - curr_keys)
    common = prev_keys & curr_keys
    modified = sorted([k for k in common if prev[k] != curr[k]])
    return {"added": added, "removed": removed, "modified": modified}


def run_command(root: Path, name: str, cmd: List[str], cwd: str = ".", timeout_sec: int = 600) -> dict:
    started = time.time()
    run_cwd = root / cwd
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(run_cwd),
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            shell=False,
        )
        ended = time.time()
        return {
            "name": name,
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "duration_sec": round(ended - started, 3),
            "stdout": proc.stdout[-6000:],
            "stderr": proc.stderr[-6000:],
            "cmd": cmd,
            "cwd": cwd,
        }
    except subprocess.TimeoutExpired as exc:
        ended = time.time()
        return {
            "name": name,
            "ok": False,
            "returncode": None,
            "duration_sec": round(ended - started, 3),
            "stdout": (exc.stdout or "")[-6000:] if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "")[-6000:] if isinstance(exc.stderr, str) else "",
            "cmd": cmd,
            "cwd": cwd,
            "error": f"timeout apos {timeout_sec}s",
        }
    except FileNotFoundError as exc:
        if os.name == "nt" and cmd and cmd[0].lower() == "npm":
            alt_cmd = ["npm.cmd", *cmd[1:]]
            try:
                proc = subprocess.run(
                    alt_cmd,
                    cwd=str(run_cwd),
                    capture_output=True,
                    text=True,
                    timeout=timeout_sec,
                    shell=False,
                )
                ended = time.time()
                return {
                    "name": name,
                    "ok": proc.returncode == 0,
                    "returncode": proc.returncode,
                    "duration_sec": round(ended - started, 3),
                    "stdout": proc.stdout[-6000:],
                    "stderr": proc.stderr[-6000:],
                    "cmd": alt_cmd,
                    "cwd": cwd,
                }
            except Exception as second_exc:
                ended = time.time()
                return {
                    "name": name,
                    "ok": False,
                    "returncode": None,
                    "duration_sec": round(ended - started, 3),
                    "stdout": "",
                    "stderr": str(second_exc),
                    "cmd": alt_cmd,
                    "cwd": cwd,
                    "error": "fallback npm.cmd falhou",
                }
        ended = time.time()
        return {
            "name": name,
            "ok": False,
            "returncode": None,
            "duration_sec": round(ended - started, 3),
            "stdout": "",
            "stderr": str(exc),
            "cmd": cmd,
            "cwd": cwd,
            "error": "comando nao encontrado",
        }


def scan_encoding_issues(root: Path, files: Iterable[str], bad_patterns: Iterable[str]) -> dict:
    findings = []
    for rel in files:
        p = root / rel
        if not p.exists() or not p.is_file():
            continue
        try:
            content = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            findings.append(
                {
                    "file": rel,
                    "line": 0,
                    "pattern": "decode_error",
                    "excerpt": "arquivo nao pode ser lido como UTF-8",
                }
            )
            continue
        lines = content.splitlines()
        for idx, line in enumerate(lines, start=1):
            for bad in bad_patterns:
                if bad and bad in line:
                    findings.append(
                        {
                            "file": rel,
                            "line": idx,
                            "pattern": bad,
                            "excerpt": line[:220],
                        }
                    )
    return {"name": "encoding_scan", "ok": len(findings) == 0, "findings": findings}


def build_event_id(change_set: dict) -> str:
    payload = json.dumps(change_set, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def append_jsonl(path: Path, payload: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def append_human_log(path: Path, payload: dict) -> None:
    ts = payload["timestamp"]
    event_id = payload["event_id"]
    status = "PASSOU" if payload["ok"] else "FALHOU"
    with path.open("a", encoding="utf-8") as f:
        f.write(f"\n[{ts}] EVENTO {event_id} -> {status}\n")
        chg = payload["changes"]
        f.write(f"  + adicionados: {len(chg['added'])}, removidos: {len(chg['removed'])}, modificados: {len(chg['modified'])}\n")
        for result in payload["results"]:
            if result.get("name") == "encoding_scan":
                if result["ok"]:
                    f.write("  - encoding_scan: OK\n")
                else:
                    f.write(f"  - encoding_scan: {len(result['findings'])} problema(s)\n")
                continue
            marker = "OK" if result.get("ok") else "ERRO"
            f.write(
                f"  - {result.get('name')}: {marker} "
                f"(rc={result.get('returncode')}, {result.get('duration_sec')}s)\n"
            )


def get_fix_hint(result: dict) -> str:
    name = str(result.get("name", ""))
    blob = f"{result.get('stderr', '')}\n{result.get('stdout', '')}".lower()

    if name == "encoding_scan":
        return "Corrija caracteres corrompidos nos arquivos apontados (ex.: Visao, Relatorios, Mes, Manha)."
    if "syntaxerror" in blob:
        return "Erro de sintaxe detectado. Corrija o arquivo indicado e rode novamente o check."
    if "spawn eperm" in blob:
        return "Falha de permissao no ambiente. Execute o comando fora do sandbox/restricao."
    if "eaddrinuse" in blob or "porta" in blob:
        return "Porta em uso. Finalize processo antigo ou altere PORT no .env."
    if name == "web_build":
        return "Build da web falhou. Verifique o primeiro erro de compilacao no log detalhado."
    if name.startswith("api_syntax"):
        return "Check da API falhou. Corrija o arquivo de servico informado."
    return "Verifique stderr/stdout do check no events.jsonl para o detalhe exato."


def extract_visual_issues(payload: dict) -> List[dict]:
    issues = []
    for result in payload.get("results", []):
        if result.get("ok"):
            continue
        if result.get("name") == "encoding_scan":
            findings = result.get("findings", [])
            preview = findings[:8]
            details = "; ".join([f"{f['file']}:{f['line']}" for f in preview]) if preview else "Sem detalhe"
            issues.append(
                {
                    "check": "encoding_scan",
                    "severity": "media",
                    "summary": f"{len(findings)} ocorrencia(s) de encoding invalido",
                    "details": details,
                    "hint": get_fix_hint(result),
                }
            )
            continue

        stderr = (result.get("stderr") or "").strip().splitlines()
        stdout = (result.get("stdout") or "").strip().splitlines()
        first_line = stderr[0] if stderr else (stdout[0] if stdout else "Sem saida de erro")
        issues.append(
            {
                "check": result.get("name"),
                "severity": "alta",
                "summary": first_line[:180],
                "details": f"rc={result.get('returncode')} | duracao={result.get('duration_sec')}s",
                "hint": get_fix_hint(result),
            }
        )
    return issues


def write_latest_report(path: Path, payload: dict) -> None:
    status = "PASSOU" if payload.get("ok") else "FALHOU"
    changes = payload.get("changes", {})
    issues = extract_visual_issues(payload)

    lines = []
    lines.append("# Pipeline Guard Report")
    lines.append("")
    lines.append(f"- status: **{status}**")
    lines.append(f"- timestamp: `{payload.get('timestamp')}`")
    lines.append(f"- event_id: `{payload.get('event_id')}`")
    lines.append("")
    lines.append("## Mudancas detectadas")
    lines.append(f"- adicionados: {len(changes.get('added', []))}")
    lines.append(f"- removidos: {len(changes.get('removed', []))}")
    lines.append(f"- modificados: {len(changes.get('modified', []))}")
    lines.append("")

    if not issues:
        lines.append("## Resultado")
        lines.append("- Nenhum bug encontrado na bateria configurada.")
    else:
        lines.append("## Bugs encontrados")
        for idx, issue in enumerate(issues, start=1):
            lines.append(f"### {idx}. {issue['check']} ({issue['severity']})")
            lines.append(f"- problema: {issue['summary']}")
            lines.append(f"- detalhe: {issue['details']}")
            lines.append(f"- como corrigir: {issue['hint']}")
            lines.append("")

    lines.append("## Proximos passos")
    lines.append("- Corrija os pontos acima.")
    lines.append("- Rode novamente: `npm run pipeline:once`.")
    lines.append("- Se estiver em commit: tente o commit novamente apos passar.")
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def print_terminal_summary(payload: dict, txt_log: Path, report_md: Path) -> None:
    status = "OK" if payload.get("ok") else "FALHA"
    print(f"[PipelineGuard] resultado: {status}")
    if payload.get("ok"):
        return
    issues = extract_visual_issues(payload)
    print("[PipelineGuard] bugs detectados:")
    for issue in issues[:5]:
        print(f"  - {issue['check']}: {issue['summary']}")
        print(f"    sugestao: {issue['hint']}")
    print(f"[PipelineGuard] relatorio visual: {report_md}")
    print(f"[PipelineGuard] log resumido: {txt_log}")


def analyze_once(root: Path, cfg: dict, change_set: dict, jsonl_log: Path, txt_log: Path, report_md: Path) -> dict:
    event_id = build_event_id(change_set)
    results = []

    for cmd_cfg in cfg.get("commands", []):
        result = run_command(
            root=root,
            name=cmd_cfg["name"],
            cmd=cmd_cfg["cmd"],
            cwd=cmd_cfg.get("cwd", "."),
            timeout_sec=int(cmd_cfg.get("timeout_sec", 600)),
        )
        results.append(result)

    enc_result = scan_encoding_issues(
        root=root,
        files=cfg.get("scan_files_for_encoding", []),
        bad_patterns=cfg.get("encoding_bad_patterns", []),
    )
    results.append(enc_result)

    ok = all(r.get("ok", False) for r in results)
    payload = {
        "timestamp": utc_now_iso(),
        "event_id": event_id,
        "ok": ok,
        "changes": change_set,
        "results": results,
    }
    append_jsonl(jsonl_log, payload)
    append_human_log(txt_log, payload)
    write_latest_report(report_md, payload)
    print_terminal_summary(payload, txt_log, report_md)
    return payload


def watch_loop(root: Path, cfg: dict, interval_sec: float, jsonl_log: Path, txt_log: Path, report_md: Path) -> int:
    watch_roots = cfg.get("watch_roots", [])
    ignore_globs = cfg.get("ignore_globs", [])
    previous = snapshot_state(root, watch_roots, ignore_globs)
    print(f"[PipelineGuard] observando mudancas em {len(previous)} arquivo(s)...")

    while True:
        time.sleep(interval_sec)
        current = snapshot_state(root, watch_roots, ignore_globs)
        change_set = diff_snapshots(previous, current)
        has_changes = any(change_set[k] for k in ("added", "removed", "modified"))
        if not has_changes:
            continue

        timestamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        changed_count = len(change_set["added"]) + len(change_set["removed"]) + len(change_set["modified"])
        print(f"[{timestamp}] mudanca detectada ({changed_count} arquivo(s)). Executando analises...")
        analyze_once(root, cfg, change_set, jsonl_log, txt_log, report_md)
        previous = current


def resolve_repo_root(script_dir: Path) -> Path:
    """Quando o script está em scripts/, a raiz do monorepo é o diretório pai."""
    script_dir = script_dir.resolve()
    parent = script_dir.parent
    if (parent / "web" / "package.json").is_file() and (parent / "package.json").is_file():
        return parent
    return script_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline de validacao continua para o projeto.")
    parser.add_argument("--once", action="store_true", help="Executa uma unica analise e encerra.")
    parser.add_argument("--interval", type=float, default=2.0, help="Intervalo do watcher em segundos (default: 2).")
    parser.add_argument(
        "--config",
        default="pipeline_guard_config.json",
        help="Arquivo de configuracao JSON (default: pipeline_guard_config.json).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    repo_root = resolve_repo_root(script_dir)
    cfg_arg = Path(args.config)
    cfg_path = cfg_arg if cfg_arg.is_absolute() else (repo_root / cfg_arg)
    cfg = load_config(cfg_path)

    logs_dir = repo_root / "pipeline_guard_logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    jsonl_log = logs_dir / "events.jsonl"
    txt_log = logs_dir / "events.log"
    report_md = logs_dir / "latest_report.md"

    if args.once:
        state = snapshot_state(repo_root, cfg.get("watch_roots", []), cfg.get("ignore_globs", []))
        change_set = {"added": sorted(state.keys()), "removed": [], "modified": []}
        payload = analyze_once(repo_root, cfg, change_set, jsonl_log, txt_log, report_md)
        print(f"[PipelineGuard] execucao unica finalizada: {'OK' if payload.get('ok') else 'FALHA'}")
        return 0 if payload.get("ok") else 1

    try:
        return watch_loop(repo_root, cfg, args.interval, jsonl_log, txt_log, report_md)
    except KeyboardInterrupt:
        print("\n[PipelineGuard] encerrado pelo usuario.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
