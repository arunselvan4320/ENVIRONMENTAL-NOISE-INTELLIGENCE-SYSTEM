"""QA measurements. Targets are fixed above the timed loops and are not edited after the run."""
import io
import json
import time
import urllib.request
import wave
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestRegressor

# Acceptance targets for one local operator on this laptop.
# Workload is sequential (concurrency 1). Latency unit is milliseconds.
# Model-load time is excluded: one untimed warmup runs first where noted.
TARGETS = {
    "GET /api/health": {"requests": 30, "p95_ms": 250, "error_rate": 0.0},
    "GET /api/devices": {"requests": 30, "p95_ms": 250, "error_rate": 0.0},
    "GET /api/overview demo 6h": {"requests": 20, "p95_ms": 800, "error_rate": 0.0},
    "GET /api/forecast demo-road": {"requests": 8, "p95_ms": 8000, "error_rate": 0.0},
    "POST /api/audio/analyse 1s sine, warmed": {"requests": 3, "p95_ms": 20000, "error_rate": 0.0},
}
BASE = "http://127.0.0.1:8000"
OUT = Path(__file__).resolve().parent / "measure_qa_results.json"


def percentile(values, q):
    ordered = sorted(values)
    if not ordered:
        return None
    index = min(len(ordered) - 1, max(0, int(round((q / 100) * (len(ordered) - 1)))))
    return ordered[index]


def request(method, url, data=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except Exception as exc:
        status = getattr(getattr(exc, "code", None), "real", None) or 0
        if hasattr(exc, "code"):
            status = exc.code
        body = str(exc).encode()
    elapsed_ms = (time.perf_counter() - started) * 1000
    return status, elapsed_ms, body


def timed(name, calls):
    samples = []
    errors = 0
    for method, url, data, headers, timeout in calls:
        status, elapsed, _body = request(method, url, data, headers, timeout)
        samples.append(elapsed)
        if status != 200:
            errors += 1
    target = TARGETS[name]
    p50 = percentile(samples, 50)
    p95 = percentile(samples, 95)
    error_rate = errors / len(samples) if samples else None
    passed = error_rate == target["error_rate"] and p95 is not None and p95 <= target["p95_ms"]
    return {
        "operation": name,
        "concurrency": 1,
        "requests": len(samples),
        "p50_ms": round(p50, 1) if p50 is not None else None,
        "p95_ms": round(p95, 1) if p95 is not None else None,
        "error_rate": error_rate,
        "target_p95_ms": target["p95_ms"],
        "target_error_rate": target["error_rate"],
        "result": "PASS" if passed else "FAIL",
        "samples_ms": [round(v, 1) for v in samples],
    }


def sine_body():
    rate = 16000
    samples = (np.sin(2 * np.pi * 1000 * np.arange(rate) / rate) * 10000).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())
    raw = buf.getvalue()
    boundary = "----KaanamQa"
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="file"; filename="tone.wav"\r\n',
        b"Content-Type: audio/wav\r\n\r\n",
        raw,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def clip(value, fallback):
    number = float(value)
    if not np.isfinite(number):
        return float(fallback)
    return float(np.clip(number, 0, 1))


def fit_rf(past):
    matrix = np.array([past[j - 6:j] for j in range(6, len(past))])
    model = RandomForestRegressor(n_estimators=32, max_depth=5, min_samples_leaf=2, random_state=42, n_jobs=1)
    return model.fit(matrix, past[6:])


def multi_horizon(series):
    """Horizons 1-6 on the same origins. Each fit sees only minutes before the origin."""
    values = np.array(series, dtype=float)
    eligible = [i for i in range(40, len(values) - 5)]
    origins = eligible[-20:]
    names = ["Persistence", "Moving average", "Linear trend", "Random Forest AI"]
    errors = {name: {h: [] for h in range(1, 7)} for name in names}
    for origin in origins:
        past = values[:origin]
        window = past[-12:]
        slope, intercept = np.polyfit(np.arange(len(window)), window, 1)
        model = fit_rf(past)
        recursive = list(past[-6:])
        for horizon in range(1, 7):
            actual = float(values[origin + horizon - 1])
            linear = clip(intercept + slope * (len(window) - 1 + horizon), past[-1])
            forest = clip(model.predict([recursive[-6:]])[0], recursive[-1])
            recursive.append(forest)
            predicted = {
                "Persistence": float(past[-1]),
                "Moving average": float(past[-6:].mean()),
                "Linear trend": linear,
                "Random Forest AI": forest,
            }
            for name, guess in predicted.items():
                errors[name][horizon].append(guess - actual)
    rows = []
    for horizon in range(1, 7):
        persistence = np.array(errors["Persistence"][horizon], dtype=float)
        persistence_mae = float(np.mean(np.abs(persistence)))
        for name in names:
            residual = np.array(errors[name][horizon], dtype=float)
            mae = float(np.mean(np.abs(residual)))
            rmse = float(np.sqrt(np.mean(np.square(residual))))
            skill = None if persistence_mae == 0 else 1 - (mae / persistence_mae)
            rows.append({
                "data_scenario": "Synthetic practice seed, demo-road minute means",
                "horizon_min": horizon,
                "method": name,
                "evaluation_points": int(len(residual)),
                "mae": round(mae, 4),
                "rmse": round(rmse, 4),
                "skill_vs_persistence": None if skill is None else round(skill, 4),
            })
    return {"series_points": int(len(values)), "origins": len(origins), "rows": rows}


def main():
    print("TARGETS_LOCKED")
    print(json.dumps(TARGETS))
    health_url = BASE + "/api/health"
    devices_url = BASE + "/api/devices"
    overview_url = BASE + "/api/overview?source=demo&device_id=all&hours=6"
    forecast_url = BASE + "/api/forecast?source=demo&device_id=demo-road"
    road_url = BASE + "/api/overview?source=demo&device_id=demo-road&hours=24"
    export_url = BASE + "/api/export.csv?source=demo&device_id=demo-road&hours=6"
    body, headers = sine_body()
    audio_url = BASE + "/api/audio/analyse"
    # Warmups are not part of the timed sample.
    request("GET", health_url)
    request("GET", overview_url, timeout=60)
    request("GET", forecast_url, timeout=120)
    warmup_status, warmup_ms, warmup_body = request("POST", audio_url, body, headers, timeout=180)
    performance = [
        timed("GET /api/health", [("GET", health_url, None, None, 30)] * TARGETS["GET /api/health"]["requests"]),
        timed("GET /api/devices", [("GET", devices_url, None, None, 30)] * TARGETS["GET /api/devices"]["requests"]),
        timed("GET /api/overview demo 6h", [("GET", overview_url, None, None, 60)] * TARGETS["GET /api/overview demo 6h"]["requests"]),
        timed("GET /api/forecast demo-road", [("GET", forecast_url, None, None, 120)] * TARGETS["GET /api/forecast demo-road"]["requests"]),
        timed("POST /api/audio/analyse 1s sine, warmed", [("POST", audio_url, body, headers, 180)] * TARGETS["POST /api/audio/analyse 1s sine, warmed"]["requests"]),
    ]
    _status, _elapsed, overview_body = request("GET", overview_url, timeout=60)
    overview = json.loads(overview_body)
    _status, _elapsed, road_body = request("GET", road_url, timeout=60)
    road = json.loads(road_body)
    series = [point["index"] for point in road.get("series", [])]
    forecast_eval = multi_horizon(series) if len(series) >= 46 else {"series_points": len(series), "origins": 0, "rows": []}
    export_status, _elapsed, export_body = request("GET", export_url, timeout=60)
    recognition = {}
    try:
        recognition = json.loads(warmup_body).get("classification", {})
    except Exception:
        recognition = {"raw": warmup_body[:200].decode("utf-8", "replace")}
    payload = {
        "targets": TARGETS,
        "warmup_audio": {"status": warmup_status, "ms": round(warmup_ms, 1), "label": recognition.get("label"), "available": recognition.get("available"), "confidence": recognition.get("confidence")},
        "overview_6h": {"status": overview.get("total") is not None, "total": overview.get("total"), "current": overview.get("current"), "newest": (overview.get("recent") or [{}])[0].get("timestamp"), "calibration": (overview.get("recent") or [{}])[0].get("calibration")},
        "export_without_token": {"status": export_status, "header": export_body.decode("utf-8", "replace").splitlines()[0] if export_body else ""},
        "performance": [{k: v for k, v in row.items() if k != "samples_ms"} | {"samples_ms": row["samples_ms"]} for row in performance],
        "forecast": forecast_eval,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
