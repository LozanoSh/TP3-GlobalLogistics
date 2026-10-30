"""Construye figuras únicamente desde carpetas reales de tests/results."""
import argparse
import csv
import gzip
import json
import re
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
    values = summary.get("metrics", {}).get(name, {})
    if field in values:  # k6 2.x JSON format
        return values[field]
    return values.get("values", {}).get(field)  # older k6 JSON format


def metric_points(run: Path):
    zipped = run / "k6_metrics.json.gz"
    plain = run / "k6_metrics.json"
    if zipped.exists():
        stream = gzip.open(zipped, "rt", encoding="utf-8-sig")
    elif plain.exists():
        stream = plain.open(encoding="utf-8-sig")
    else:
        raise FileNotFoundError(f"Faltan metricas crudas de k6 en {run}")
    with stream:
        for line in stream:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def parse_percent(value: str) -> float:
    return float(value.strip().replace("%", ""))


def memory_mib(value: str) -> float:
    amount = value.split("/", 1)[0].strip()
    match = re.match(r"([\d.]+)\s*(MiB|GiB|KiB)", amount)
    if not match:
        return float("nan")
    number = float(match.group(1))
    return number * {"KiB": 1/1024, "MiB": 1, "GiB": 1024}[match.group(2)]


def save_latency(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    points = {"validacion": [], "cpu": []}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        key = "cpu" if metadata["escenario"] == "extremo" else "validacion"
        points[key].append((metadata["vus"], metric(summary, "http_req_duration", "avg"), metric(summary, "http_req_duration", "p(95)"), metric(summary, "http_req_duration", "p(99)")))
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    styles = ((1, "Promedio", "-"), (2, "p95", "--"), (3, "p99", ":"))
    for ax, endpoint in zip(axes, ("validacion", "cpu")):
        data = points[endpoint]
        data.sort()
        for index, label, style in styles:
            ax.plot([p[0] for p in data], [p[index] for p in data], marker="o", linestyle=style, label=label)
        ax.set(xlabel="Usuarios virtuales concurrentes", ylabel="Latencia (ms)", title="POST validacion" if endpoint == "validacion" else "GET CPU (work=100)")
        ax.grid(True, alpha=.3); ax.legend()
    fig.suptitle("Latencia por concurrencia (endpoints en paneles separados)")
    fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_throughput(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    points = {"validacion": [], "cpu": []}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        key = "cpu" if metadata["escenario"] == "extremo" else "validacion"
        points[key].append((metadata["vus"], metric(summary, "http_reqs", "rate")))
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for ax, endpoint in zip(axes, ("validacion", "cpu")):
        data = points[endpoint]
        data.sort(); ax.plot([p[0] for p in data], [p[1] for p in data], marker="o")
        ax.set(xlabel="Usuarios virtuales", ylabel="Requests/s", title="POST validacion" if endpoint == "validacion" else "GET CPU (work=100)")
        ax.grid(True, alpha=.3)
    fig.suptitle("Throughput por concurrencia (endpoints separados)")
    fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_cpu(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    series: dict[str, dict[str, list[float]]] = {}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        if metadata.get("escenario") != "extremo":
            continue  # CPU load series only; do not mix it with POST validation load.
        vus = int(metadata["vus"])
        with (run / "docker_stats.csv").open(newline="", encoding="utf-8-sig") as stream:
            for row in csv.DictReader(stream):
                if "api" in row["container"]:
                    series.setdefault(row["container"], {}).setdefault(str(vus), []).append(parse_percent(row["cpu_percent"]))
    fig, ax = plt.subplots(figsize=(8, 5))
    levels = sorted({int(level) for data in series.values() for level in data})
    width = 0.22
    for index, (container, data) in enumerate(sorted(series.items())):
        means = [sum(data.get(str(level), [])) / len(data[str(level)]) if data.get(str(level)) else 0 for level in levels]
        positions = [i + (index - 1) * width for i in range(len(levels))]
        ax.bar(positions, means, width, label=container)
    if not series:
        raise ValueError("docker_stats.csv no contiene muestras de api1/api2/api3")
    ax.set_xticks(range(len(levels)), [str(level) for level in levels])
    ax.set(xlabel="Usuarios virtuales (work=100)", ylabel="CPU promedio del contenedor (%)", title="CPU promedio por replica y escalon")
    ax.axhline(100, color="red", linestyle="--", linewidth=1, label="100% de un nucleo")
    ax.grid(axis="y", alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_errors(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    labels, failed, health_failures, http_errors = [], [], [], []
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        summary = k6_summary(run)
        labels.append(f"{metadata['escenario']}\n{metadata['vus']} VU")
        failed_count = 0
        status_errors = 0
        for item in metric_points(run):
            if item.get("type") != "Point":
                continue
            tags = item.get("data", {}).get("tags", {})
            if item.get("metric") == "http_req_failed":
                failed_count += int(float(item.get("data", {}).get("value", 0)) > 0)
            if item.get("metric") == "http_req_duration":
                status_errors += int(str(tags.get("status", "")) in {"502", "503", "504"})
        health_path = run / "health.csv"
        health_count = 0
        if health_path.exists():
            with health_path.open(newline="", encoding="utf-8-sig") as stream:
                health_count = sum(1 for row in csv.DictReader(stream) if row.get("route") == "/health" and row.get("http_status") != "200")
        failed.append(failed_count); health_failures.append(health_count); http_errors.append(status_errors)
    x = list(range(len(labels))); width = .26
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 1.2), 5))
    ax.bar([i-width for i in x], failed, width, label="Solicitudes k6 fallidas")
    ax.bar(x, health_failures, width, label="Fallos/timeouts de /health")
    ax.bar([i+width for i in x], http_errors, width, label="HTTP 502/503/504")
    ax.set_xticks(x, labels); ax.set_ylabel("Cantidad de eventos"); ax.set_title("Errores y timeouts por escenario")
    ax.grid(axis="y", alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def save_replica_distribution(runs: list[Path], output: Path) -> None:
    import matplotlib.pyplot as plt
    labels = []
    counts = {name: [] for name in ("api1", "api2", "api3")}
    for run in runs:
        metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
        labels.append(f"{metadata['escenario']}\n{metadata['vus']} VU")
        values = {name: 0 for name in counts}
        for item in metric_points(run):
            if item.get("type") == "Point" and item.get("metric") == "replica_requests":
                tags = item.get("data", {}).get("tags", {})
                instance = tags.get("instancia")
                if instance in values:
                    values[instance] += float(item.get("data", {}).get("value", 0))
        total = sum(values.values())
        for name in counts:
            counts[name].append((values[name] * 100 / total) if total else 0)
    fig, ax = plt.subplots(figsize=(max(8, len(labels) * 1.2), 5))
    x = list(range(len(labels))); bottom = [0] * len(labels)
    for name, values in counts.items():
        ax.bar(x, values, bottom=bottom, label=name)
        bottom = [a + b for a, b in zip(bottom, values)]
    ax.set_xticks(x, labels); ax.set_ylabel("Porcentaje de solicitudes (%)"); ax.set_ylim(0, 100); ax.set_title("Distribución por réplica")
    ax.grid(axis="y", alpha=.3); ax.legend(); fig.tight_layout(); fig.savefig(output, dpi=160); plt.close(fig)


def write_summary_csv(runs: list[Path]) -> Path:
    output = RESULTS / "resumen_escenarios.csv"
    fields = ["run", "scenario", "endpoint", "vus", "work", "requests", "rps", "avg_ms", "p95_ms", "p99_ms", "max_ms", "k6_failed_requests", "health_probes", "health_failed", "health_over_1s", "health_max_ms", "cpu_api1_avg_pct", "cpu_api1_max_pct", "cpu_api2_avg_pct", "cpu_api2_max_pct", "cpu_api3_avg_pct", "cpu_api3_max_pct", "memory_api1_max_mib", "memory_api2_max_mib", "memory_api3_max_mib", "api1_requests", "api2_requests", "api3_requests"]
    with output.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for run in runs:
            metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8-sig"))
            summary = k6_summary(run)
            scenario = metadata.get("escenario", "")
            row = {
                "run": run.name,
                "scenario": scenario,
                "endpoint": "/api/cpu" if scenario == "extremo" else "/envios/validar",
                "vus": metadata.get("vus"),
                "work": metadata.get("work") or "",
                "requests": metric(summary, "http_reqs", "count"),
                "rps": metric(summary, "http_reqs", "rate"),
                "avg_ms": metric(summary, "http_req_duration", "avg"),
                "p95_ms": metric(summary, "http_req_duration", "p(95)"),
                "p99_ms": metric(summary, "http_req_duration", "p(99)"),
                "max_ms": metric(summary, "http_req_duration", "max"),
            }
            failed = 0
            replica_counts = {"api1": 0, "api2": 0, "api3": 0}
            for item in metric_points(run):
                if item.get("type") != "Point":
                    continue
                name = item.get("metric")
                value = float(item.get("data", {}).get("value", 0))
                if name == "http_req_failed":
                    failed += int(value > 0)
                if name == "replica_requests":
                    replica = item.get("data", {}).get("tags", {}).get("instancia")
                    if replica in replica_counts:
                        replica_counts[replica] += value
            row["k6_failed_requests"] = failed
            row.update({f"{key}_requests": int(value) for key, value in replica_counts.items()})
            health_path = run / "health.csv"
            health_rows = []
            if health_path.exists():
                with health_path.open(newline="", encoding="utf-8-sig") as health_stream:
                    health_rows = [entry for entry in csv.DictReader(health_stream) if entry.get("route") == "/health"]
            health_ms = [float(entry["elapsed_ms"]) for entry in health_rows if entry.get("elapsed_ms")]
            row["health_probes"] = len(health_rows)
            row["health_failed"] = sum(entry.get("http_status") != "200" for entry in health_rows)
            row["health_over_1s"] = sum(value > 1000 for value in health_ms)
            row["health_max_ms"] = max(health_ms, default="")
            cpu = {}
            memory = {}
            stats_path = run / "docker_stats.csv"
            if stats_path.exists():
                with stats_path.open(newline="", encoding="utf-8-sig") as stats_stream:
                    for entry in csv.DictReader(stats_stream):
                        container = entry.get("container", "")
                        for replica in ("api1", "api2", "api3"):
                            if replica in container:
                                cpu.setdefault(replica, []).append(parse_percent(entry["cpu_percent"]))
                                memory.setdefault(replica, []).append(memory_mib(entry["memory_usage"]))
            for replica in ("api1", "api2", "api3"):
                values = cpu.get(replica, [])
                row[f"cpu_{replica}_avg_pct"] = (sum(values) / len(values)) if values else ""
                row[f"cpu_{replica}_max_pct"] = max(values, default="")
                mem_values = memory.get(replica, [])
                row[f"memory_{replica}_max_mib"] = max(mem_values, default="")
            writer.writerow(row)
    return output


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
    summary_csv = write_summary_csv(runs)
    print(f"Graficos generados desde {len(runs)} corridas reales en {OUTPUT}; tabla: {summary_csv}")


if __name__ == "__main__":
    main()
