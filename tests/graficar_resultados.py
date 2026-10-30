"""Construye figuras únicamente desde carpetas reales de tests/results."""
import argparse
import csv
import json
from pathlib import Path



ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "tests" / "results"
OUTPUT = ROOT / "evidencias"


def k6_summary(run: Path) -> dict:
    path = run / "k6_summary.json"
    if not path.exists():
        raise FileNotFoundError(f"Falta resumen real de k6: {path}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def metric(summary: dict, name: str, field: str):
    return summary.get("metrics", {}).get(name, {}).get("values", {}).get(field)


def parse_percent(value: str) -> float:
    return float(value.strip().replace("%", ""))


def save_latency(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    points = []
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        points.append((metadata["vus"], metric(summary, "http_req_duration", "avg"), metric(summary, "http_req_duration", "p(95)"), metric(summary, "http_req_duration", "p(99)")))
    points.sort()
    fig, ax = plt.subplots(figsize=(8, 5))
    for index, label in ((1, "Promedio"), (2, "p95"), (3, "p99")):
        ax.plot([p[0] for p in points], [p[index] for p in points], marker="o", label=label)
    ax.set(xlabel="Usuarios virtuales concurrentes", ylabel="Latencia (ms)", title="Latencia según concurrencia")
    ax.grid(True, alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_throughput(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    points = []
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        points.append((metadata["vus"], metric(summary, "http_reqs", "rate")))
    points.sort()
    fig, ax = plt.subplots(figsize=(8, 5)); ax.plot([p[0] for p in points], [p[1] for p in points], marker="o")
    ax.set(xlabel="Usuarios virtuales concurrentes", ylabel="Requests/s", title="Throughput según concurrencia")
    ax.grid(True, alpha=.3); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_cpu(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    series: dict[str, list[tuple[int, float]]] = {}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        vus = int(metadata["vus"])
        with (run / "docker_stats.csv").open(newline="", encoding="utf-8-sig") as stream:
            for row in csv.DictReader(stream):
                if "api" in row["container"]:
                    series.setdefault(row["container"], []).append((vus, parse_percent(row["cpu_percent"])))
    fig, ax = plt.subplots(figsize=(8, 5))
    for container, values in sorted(series.items()):
        values.sort(); ax.plot([x for x, _ in values], [y for _, y in values], marker=".", label=container)
    if not series:
        raise ValueError("docker_stats.csv no contiene muestras de api1/api2/api3")
    ax.set(xlabel="Usuarios virtuales concurrentes", ylabel="CPU del contenedor (%)", title="CPU por réplica durante la carga")
    ax.grid(True, alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_errors(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    labels, failed, timeouts, http_errors = [], [], [], []
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        labels.append(f"{metadata['escenario']}\n{metadata['vus']} VU")
        failed.append(metric(summary, "http_req_failed", "rate") or 0)
        timeout_count = 0
        status_errors = 0
        metrics_path = run / "k6_metrics.json"
        if metrics_path.exists():
            for line in metrics_path.read_text(encoding="utf-8-sig").splitlines():
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if item.get("type") == "Point" and item.get("metric") == "http_req_duration":
                    tags = item.get("data", {}).get("tags", {})
                    status = str(tags.get("status", ""))
                    error = str(tags.get("error", ""))
                    timeout_count += int("timeout" in error.lower() or "deadline" in error.lower())
                    status_errors += int(status in {"502", "503", "504"})
        timeouts.append(timeout_count); http_errors.append(status_errors)
    x = list(range(len(labels))); width = .26
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 1.2), 5))
    ax.bar([i-width for i in x], failed, width, label="Tasa de solicitudes fallidas")
    ax.bar(x, timeouts, width, label="Timeouts (cantidad)")
    ax.bar([i+width for i in x], http_errors, width, label="HTTP 502/503/504 (cantidad)")
    ax.set_xticks(x, labels); ax.set_ylabel("Tasa o cantidad (ver leyenda)"); ax.set_title("Errores y timeouts por escenario")
    ax.grid(axis="y", alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_replica_distribution(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    labels = []
    counts = {name: [] for name in ("api1", "api2", "api3")}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        labels.append(f"{metadata['escenario']}\n{metadata['vus']} VU")
        values = {name: 0 for name in counts}
        metrics_path = run / "k6_metrics.json"
        with metrics_path.open(encoding="utf-8-sig") as stream:
            for line in stream:
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if item.get("type") == "Point" and item.get("metric") == "replica_requests":
                    tags = item.get("data", {}).get("tags", {})
                    instance = tags.get("instancia")
                    if instance in values:
                        values[instance] += float(item.get("data", {}).get("value", 0))
        for name in counts:
            counts[name].append(values[name])
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 1.2), 5))
    x = list(range(len(labels))); bottom = [0] * len(labels)
    for name, values in counts.items():
        ax.bar(x, values, bottom=bottom, label=name)
        bottom = [a + b for a, b in zip(bottom, values)]
    ax.set_xticks(x, labels); ax.set_ylabel("Solicitudes observadas"); ax.set_title("Distribución por réplica")
    ax.grid(axis="y", alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", nargs="+", required=True, help="Carpetas de ejecuciones reales dentro de tests/results")
    args = parser.parse_args()
    runs = [(RESULTS / item).resolve() for item in args.runs]
    if not runs or any(not run.is_dir() for run in runs):
        raise FileNotFoundError("Todas las carpetas de corrida deben existir bajo tests/results")
    if any(RESULTS not in run.parents for run in runs):
        raise ValueError("Por seguridad, las fuentes deben estar dentro de tests/results")
    for run in runs:
        k6_summary(run)
    OUTPUT.mkdir(exist_ok=True)
    save_latency(runs, OUTPUT / "rendimiento_latencia.png")
    save_throughput(runs, OUTPUT / "rendimiento_throughput.png")
    save_cpu(runs, OUTPUT / "rendimiento_cpu_replicas.png")
    save_errors(runs, OUTPUT / "rendimiento_errores.png")
    save_replica_distribution(runs, OUTPUT / "rendimiento_distribucion_replicas.png")
    print(f"Graficos generados desde {len(runs)} corridas reales en {OUTPUT}")


if __name__ == "__main__":
    main()
