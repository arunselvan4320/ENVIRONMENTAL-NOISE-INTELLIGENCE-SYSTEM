# Kaanam — Environmental Noise Intelligence with AI

A full-stack research prototype based on the supplied environmental noise project report. This updated version integrates a pretrained **Audio Spectrogram Transformer (AST)** for sound recognition, **Random Forest regression** for forecasting and optional authenticated ESP32 audio ingestion.

## Start with AI (Windows)

1. Install Python 3.11 or 3.12 and enable Add Python to PATH.
2. Extract this ZIP completely.
3. Double-click `start_windows_ai.bat`.
4. First launch installs CPU PyTorch and other dependencies and downloads approximately 346 MB of model weights. Allow additional space for Python packages and RAM for inference. Internet access is needed for setup, not for later cached inference.
5. Open http://127.0.0.1:8000 and select **Sound lab**. The status should say **PRETRAINED AI READY**.
6. Upload a permitted WAV recording or click **Try a generated test tone**. The top five candidate sounds and model scores appear beside the waveform/spectrogram.
7. Administrator access uses the token in `data/admin-token.txt`, or your configured `KAANAM_ADMIN_TOKEN`.

The model weights are downloaded by the launcher; they are not bundled in this small source ZIP. No paid AI API key is required. User audio is analysed on the server, not sent to Hugging Face or a third-party AI service. Model downloads contact Hugging Face.

macOS/Linux: run `bash start_mac_linux_ai.sh`.

Manual setup:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
# For Linux/Windows CPU PyTorch:
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-ai.txt
python -m ml.setup_pretrained
python run.py
```

On macOS omit the CPU-index command and let requirements-ai.txt install the platform wheel. Use the supplied BAT launcher for Windows shell quoting. Basic launchers (`start_windows.bat` / `start_mac_linux.sh`) install only the lightweight requirements: Random Forest forecasting works, but AST recognition requires the AI setup above.

## AI actually implemented

### Pretrained environmental sound recognition

Model: `MIT/ast-finetuned-audioset-10-10-0.4593`, pinned to revision `f826b80d28226b62986cc218e5cec390b1096902`.

- AST is a pretrained transformer for AudioSet sound classes, including environmental categories. It is not a language chatbot.
- Audio is decoded, mixed to mono, resampled to 16 kHz and analysed in ten-second windows. Every window is processed, including the final short window.
- Independent sigmoid scores are combined using a per-class maximum across windows. They do not sum to 100% and are not calibrated certainty percentages.
- The UI shows the five highest-scoring labels. A top score below 0.35 returns Unknown / uncertain. This threshold is exploratory.
- The first request loads the model into server memory; subsequent requests reuse it. A CPU lock serialises AST inference. Heavy inference runs outside the FastAPI event loop.
- SafeTensor weights are used; remote custom model code is disabled. Missing weights/dependencies or inference failures produce an explicit unavailable state, never invented labels.
- `GET /api/ai/status` exposes installation, pinned revision, weight presence, readiness and errors.
- An optional locally trained Random Forest sound classifier at `models/sound_model.joblib` takes precedence over AST, retaining the original custom-training workflow. Only load trusted joblib files.

The upstream checkpoint's licence is BSD-3-Clause. The downloader retains its model README. Original model and implementation references:
https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593
https://huggingface.co/docs/transformers/model_doc/audio-spectrogram-transformer

### AI forecasting

When a device has at least **40 valid consecutive one-minute bins**, the backend fits a Random Forest regressor using the previous six bins as lag features. It evaluates that model alongside persistence, moving average and linear trend.

Each evaluation prediction trains on past data only. Models use the same latest evaluation origins (up to 20). Lowest one-step validation MAE selects the displayed forecast. If a simple baseline wins, it is used. Random Forest multi-step forecasting is recursive.

At 12–39 bins, only the statistical baselines are available. Missing minute bins reset the usable contiguous history. Quality-flagged observations are excluded. Forecast metrics are unitless and one-step validation scores, not independent six-minute test accuracy. Model selection uses the same validation window; an independent chronological holdout is still required for research claims.

### ESP32 audio → AI → dashboard

An optional audio path links an actual classification to its original hardware observation:

1. ESP32 sends its normal authenticated JSON observation.
2. ESP32 optionally sends a matching short WAV to `POST /api/devices/{device_id}/audio?message_id=<same-message-id>` with `X-Device-Token` and `Content-Type: audio/wav`.
3. The server checks credentials and the existing observation, then runs sound recognition.
4. The result and model version are persisted in `ai_events`; the observation's label is updated.
5. The Hardware data dashboard and CSV export show the AI label.

Raw WAV bytes are discarded. Duplicate successful audio uploads reuse the stored classification. Invalid tokens return 401; a missing matching observation returns 404; unavailable AI returns 503. A failed classification leaves the observation Unclassified.

In `firmware/esp32_noise.ino`, set **ENABLE_AUDIO_AI=true** only where recording and transmitting audio is permitted. Configure both ENDPOINT and AUDIO_ENDPOINT, with matching device IDs. Default is false, preserving energy-only monitoring. The sketch keeps up to one second of 16 kHz PCM, sends at most one successful audio clip per minute, and uploads only when its matching observation was just accepted. It does not queue audio clips during outages. One-second clips may be less reliable than longer recordings for some sound classes; validate in the actual environment.

## Dashboard features

- Overview: current/mean/peak indices, threshold counts, time-series SVG chart, sound-source donut, schematic monitoring layout and observations.
- Forecast studio: per-device AI/baseline comparison, MAE/RMSE and six-step projections.
- Sound lab: pretrained recognition, candidate score bars, waveform, spectrogram and seven real signal features.
- Sensor network: registration with one-time per-device credentials.
- Alert centre: configurable index threshold and acknowledged events.
- CSV export and OpenAPI documentation at `/docs`.

Frontend: HTML/CSS/JavaScript; backend: FastAPI/SQLite/NumPy/SciPy; AI: PyTorch/Transformers/scikit-learn. Browser data refreshes every ten seconds. Fonts fall back to local fonts if Google Fonts is unavailable.

Demo scenarios and labels are explicitly **synthetic**, created once at first launch. They do not become real AI results after installation. Select Hardware data for real observations. The schematic is not a geographic map.

## Hardware

Example classic ESP32 + INMP441 wiring (verify your module):

- VDD → 3.3 V; GND → GND.
- SCK/BCLK → GPIO 26; WS/LRCLK → GPIO 25; SD/DOUT → GPIO 33.
- L/R → GND for the left channel.

The supplied Arduino sketch targets Arduino-ESP32 2.x legacy I²S APIs. Newer cores require adaptation. Firmware and physical wiring have not been compiled or tested on hardware in this delivery.

Set Wi-Fi credentials, registered device ID/token, HTTPS endpoints and the trusted server ROOT_CA certificate. Certificate verification is never disabled. NTP time is required. The RAM observation retry queue holds 32 messages, marks overflow and does not survive power loss. Audio uploads add networking/capture gaps and require more RAM than energy-only mode.

The microphone index is defined as `min(1, 8 * RMS(normalised_PCM))`. It is **not dB SPL or LAeq**. Microphone gain, clipping, calibration, reference comparison and A-weighting are not solved by adding AI. Digital dBFS in Sound lab is different from SPL.

## Public free hosting

The console, the API, and the practice database can go online on the free plans. The 330 MB sound-model file stays on your computer: a free Render instance does not have room for PyTorch and those weights. Forecasts still run. Sound lab reports that the model is not installed until you use a larger host.

1. Supabase: create a project and copy the Postgres connection string (the pooler URI is fine). The API creates its tables on startup. Free projects can pause after a week without use.
2. Render: create a Blueprint from this repository, or a Python web service with root `render.yaml`. Set `DATABASE_URL` to the Supabase string and `KAANAM_ADMIN_TOKEN` to a long secret you keep. The free service sleeps after 15 minutes, so the first visit after that can take half a minute. Health check: `/api/health`.
3. Vercel: import this repository, set the root directory to `web`, and set `KAANAM_API_ORIGIN` to the Render address with no trailing slash, for example `https://kaanam-api.onrender.com`. Vercel gives a free `*.vercel.app` address. Redeploy the console after the API address exists, because that address is read when the console is built.

Do not commit `data/admin-token.txt`, `data/noise.db`, or `models/ast/`. On your own machine the API still uses SQLite when `DATABASE_URL` is unset.

A paid host that can hold the sound model can still use the Dockerfile, which installs PyTorch and downloads the weights during the image build. That path was not run in this delivery.

This remains a research prototype. Read endpoints and the Sound lab upload are open. Add viewer authentication, upload limits, retention, and backups before treating it as a shared production service. No custom domain was purchased.

## Configuration

- DATABASE_URL or KAANAM_DATABASE_URL: Supabase Postgres connection string. When unset, readings stay in SQLite.
- KAANAM_DATA_DIR: SQLite and generated token folder, default data/.
- KAANAM_API_ORIGIN: public API address used by the Next.js console. Local default is http://127.0.0.1:8000.
- KAANAM_ADMIN_TOKEN: fixed administrator secret. If unset, the server reuses data/admin-token.txt and creates that file only when it is missing.
- KAANAM_DEMO: 1 seeds demo data; 0 disables seeding/demo tick. Existing demo records are retained but separated.
- KAANAM_AST_MODEL_DIR: local pretrained model directory, default models/ast/.
- KAANAM_AI_THREADS: CPU thread count, default 2.

Only one server process is recommended for this prototype. Each process would otherwise load its own model. No `.env` auto-loader is implemented.

## API payloads

Device observation: POST `/api/observations`, header `X-Device-Token`, JSON:

```json
{"device_id":"node_01","message_id":"boot-a-1","timestamp":"2026-11-14T12:00:00Z","level_index":0.42,"quality_flags":[],"calibration_version":"unvalidated"}
```

Use the actual acquisition timestamp, including timezone. Values must be finite and within 0–1. Timestamps more than five minutes ahead, or more than 48 hours old, are rejected. A repeated device and message identity returns the original row with HTTP 200. Flags: clipping, clock_unsynced, wind_suspected, packet_gap.

Sound lab: POST `/api/audio/analyse`, multipart field `file`. Device AI: POST `/api/devices/{device_id}/audio?message_id=...`, raw WAV body. Both accept uncompressed 16-bit PCM WAV, mono/stereo, 8–96 kHz, 0.1–30 seconds, up to 6 MiB.

Administrator routes use X-Admin-Token: `/api/admin/check`, device registration, alert acknowledgement, threshold settings and demo ticks. Inspect `/docs` for full schemas.

## Custom classifier training

For your own permitted recordings, create a CSV with `path,label,group`. Paths are relative to the CSV; group identifies the original recording session or location. Supply at least five independent groups, with all classes present on both sides of the deterministic group-disjoint split.

```bash
python -m ml.train recordings.csv
```

This writes a seven-feature Random Forest sound classifier and an evaluation JSON with per-class metrics, macro F1, balanced accuracy, confusion matrix and majority baseline. It is separate from AST and the forecasting regressor. MFCC/CNN comparisons and real-field validation are still future research work.

## Verification

Run `python -m unittest discover -s tests -v`.

Nine integration tests cover authentication, device audio linkage/idempotency (test-double recognition), WAV features, source separation, invalid readings/time, quality exclusion, AI/baseline forecasting, frontend serving and export. Separately, the real pretrained AST weights were downloaded and a real forward pass correctly gave Sine wave as the highest-scoring label for a generated sine tone. This proves the integration runs; it is not an environmental accuracy evaluation.

See VERIFICATION.json for actual checks and versions. Hardware behaviour, field accuracy, calibration, Windows/macOS launchers and Docker remain unverified. No benchmark score or research hypothesis is claimed as a measured project result.
