# Kaanam software QA report

Date: 17 November 2026 (UTC, same clock as London in November).

Scope: the FastAPI server on `http://127.0.0.1:8000` and the Next.js console on `http://127.0.0.1:3000`. Hardware was not connected. Field accuracy was not tested.

A passing test suite is not evidence of zero defects. Open and unreleased defects are listed in section C.

The report text does not number FR1–FR8. Those IDs in section D are labels for requirements the report states in prose.

## Environment

| Item | Recorded value |
| --- | --- |
| Machine | Micro-Star Thin GF63 12VE |
| Processor | 12th Gen Intel Core i7-12650H, 10 cores, 16 logical processors, max clock 2300 MHz |
| Memory | 16866521088 bytes (15.7 GB) |
| Operating system | Windows 11 Pro, version 10.0.26300 |
| API interpreter | Python 3.13.14, `C:\Program Files\Python313\python.exe`, process `run.py` |
| Measurement client | Project virtualenv, `qa/measure_qa.py` |
| Integration tests | `python -m unittest discover -s tests -v` from the project directory, using the project virtualenv. 12 tests, OK, 24.999 s |
| Browser checks | Headless Microsoft Edge through Playwright, `qa/e2e_console.py`. Exit 0 in 15.1 s |

## How rates are calculated

Pass rate = Passed ÷ (Passed + Failed) × 100. Blocked and not-run rows are not counted as passed. If Passed + Failed is 0, the pass rate is N/A.

Execution coverage = (Passed + Failed) ÷ Total × 100. If Total is 0, coverage is N/A.

## A. Test execution summary

| Test Area | Total | Passed | Failed | Blocked | Not Run | Pass Rate | Execution coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API | 10 | 8 | 0 | 0 | 2 | 100% | 80.0% |
| Authentication | 7 | 6 | 0 | 0 | 1 | 100% | 85.7% |
| Database | 6 | 5 | 0 | 0 | 1 | 100% | 83.3% |
| Audio analysis | 7 | 7 | 0 | 0 | 0 | 100% | 100% |
| Forecasting | 5 | 5 | 0 | 0 | 0 | 100% | 100% |
| Frontend | 5 | 5 | 0 | 0 | 0 | 100% | 100% |
| End-to-end | 4 | 4 | 0 | 0 | 0 | 100% | 100% |
| Performance | 5 | 5 | 0 | 0 | 0 | 100% | 100% |
| Hardware | 3 | 0 | 0 | 3 | 0 | N/A | 0% |
| All areas | 52 | 45 | 0 | 3 | 4 | 100% | 86.5% |

## B. Detailed test case results

| Test ID | Component | Test Scenario | Expected Result | Actual Result | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| TC-API-01 | API | GET /api/health | HTTP 200 and status ok | HTTP 200; body starts with status ok | PASS | Evidence log below |
| TC-API-02 | API | Forecast with device_id=all | HTTP 422 | HTTP 422, select one device | PASS | Evidence log |
| TC-API-03 | API | Practice overview, last 6 hours | Non-empty practice series | total 1056; newest 2026-11-17T13:46:00+00:00; synthetic | PASS | qa/measure_qa_results.json |
| TC-API-04 | API | CSV export | HTTP 200 and unitless column name | HTTP 200; header includes level_index_unitless | PASS | qa/measure_qa_results.json |
| TC-API-05 | API | Level above 1 | HTTP 422 | HTTP 422 | PASS | test_invalid_measurements |
| TC-API-06 | API | Timestamp with no timezone | HTTP 422 | HTTP 422 | PASS | test_invalid_measurements |
| TC-API-07 | API | Timestamp more than five minutes ahead | HTTP 422 | HTTP 422 | PASS | test_invalid_measurements |
| TC-API-08 | API | Timestamp more than 48 hours old | HTTP 422 | HTTP 422 | PASS | test_invalid_measurements |
| TC-API-09 | API | OpenAPI at /docs | HTTP 200 | Not executed | NOT RUN | No request was sent |
| TC-API-10 | API | Admin demo tick | HTTP 200 and a new row | Not executed | NOT RUN | Would write the live database |
| TC-AUTH-01 | Authentication | Register with no admin token | HTTP 401 | HTTP 401 | PASS | test_auth |
| TC-AUTH-02 | Authentication | Register with a bad admin token | HTTP 401 | HTTP 401 | PASS | test_auth |
| TC-AUTH-03 | Authentication | Observation with no device token | HTTP 401 | HTTP 401 | PASS | test_auth |
| TC-AUTH-04 | Authentication | Observation with device token | HTTP 201 | HTTP 201 | PASS | test_auth |
| TC-AUTH-05 | Authentication | Acknowledge with no admin token | HTTP 401 | HTTP 401 | PASS | test_dedup_and_ack |
| TC-AUTH-06 | Authentication | Acknowledge with admin token | HTTP 200 | HTTP 200 | PASS | test_dedup_and_ack |
| TC-AUTH-07 | Authentication | Viewer refused on CSV download | No acceptance test was defined for a control that is not in this build | Not executed as an acceptance test. A probe returned HTTP 200 | NOT RUN | DEF-006 |
| TC-DB-01 | Database | Repeat the same message identity | HTTP 200 and the original id | HTTP 201 then HTTP 200; same id; duplicate true | PASS | test_dedup_and_ack |
| TC-DB-02 | Database | Clipping flag excluded from valid rows and alerts | valid 0; flagged 1; no alert | Matching assertions passed | PASS | test_quality |
| TC-DB-03 | Database | Practice rows stay out of the live view | Live recent rows are not synthetic | Assertions passed | PASS | test_demo_separation |
| TC-DB-04 | Database | Practice rows sit inside the default 6-hour view | Newest practice time is inside 6 hours | newest 2026-11-17T13:46:00+00:00; total 1056 | PASS | qa/measure_qa_results.json |
| TC-DB-05 | Database | Bad stored time does not crash forecast | HTTP 200 | HTTP 200 | PASS | test_forecast |
| TC-DB-06 | Database | Two identical posts at the same moment | One row and no HTTP 500 | Not executed | NOT RUN | No concurrent command |
| TC-AUD-01 | Audio analysis | 1 kHz WAV centroid | Near 1000 Hz and a spectrogram | Assertions passed | PASS | test_audio |
| TC-AUD-02 | Audio analysis | Non-WAV body | HTTP 422 | HTTP 422 | PASS | test_audio |
| TC-AUD-03 | Audio analysis | Device clip auth and repeat | HTTP 401, then stored label, then duplicate. Model is a test double | Assertions passed | PASS | test_ai_status_and_device_audio |
| TC-AUD-04 | Audio analysis | Live 1-second 1 kHz tone | HTTP 200 and available true | label Beep, bleep; confidence 0.7578453421592712; 33959.9 ms including first load | PASS | qa/measure_qa_results.json warmup_audio |
| TC-AUD-05 | Audio analysis | Top score below 0.35 | Unknown / uncertain | Label Unknown / uncertain; confidence below 0.35; probabilities present; available true | PASS | test_uncertain_when_top_score_is_low |
| TC-AUD-06 | Audio analysis | Weights missing | Unavailable, no invented label | available false; confidence null; probabilities empty; label AI model not installed | PASS | test_missing_weights_are_unavailable |
| TC-AUD-07 | Audio analysis | Optional joblib classifier | Result names that classifier | Note contains Optional local classifier; model_version qa-optional | PASS | test_optional_classifier_replaces_transformer |
| TC-FCT-01 | Forecasting | Long practice history for one sensor | 6 points and 4 methods | Assertions passed | PASS | test_forecast |
| TC-FCT-02 | Forecasting | Fewer than 12 bins | available false | Passed on a 5-point series | PASS | test_forecast |
| TC-FCT-03 | Forecasting | Forest omitted below 40 bins | Three baselines only | 20-point series available; methods Persistence, Moving average, Linear trend; ai_evaluated false | PASS | test_forecast |
| TC-FCT-04 | Forecasting | Forecast after a bad stored time | HTTP 200 | HTTP 200 | PASS | test_forecast |
| TC-FCT-05 | Forecasting | Horizons 1–6 on the synthetic road series | 24 scored rows on shared origins | 361 minute means; 20 origins; 24 rows | PASS | qa/measure_qa_results.json forecast |
| TC-FE-01 | Frontend | Server page | HTTP 200 and contains Kaanam | HTTP 200; Kaanam present | PASS | test_frontend_export and evidence log |
| TC-FE-02 | Frontend | Server page points at the console | Text contains 127.0.0.1:3000 | Present | PASS | GET http://127.0.0.1:8000/ |
| TC-FE-03 | Frontend | Console page | HTTP 200 | HTTP 200; 38861 bytes | PASS | GET http://127.0.0.1:3000/ |
| TC-FE-04 | Frontend | Browser shows the corrected chart title and seed caption | Those words are visible | Headless Edge waited for both sentences | PASS | qa/e2e_console.py printed TC-FE-04 PASS |
| TC-FE-05 | Frontend | Stylesheet | HTTP 200 | HTTP 200 | PASS | test_frontend_export |
| TC-E2E-01 | End-to-end | Console and API proxy both answer | HTTP 200 and HTTP 200 | Page 200; proxy health 200 | PASS | Evidence log |
| TC-E2E-02 | End-to-end | Browser filter change and alert acknowledgement | Seen state matches the click | Live view showed the empty-range sentence; practice view restored the seed caption; the QA sensor card then showed Seen | PASS | qa/e2e_console.py printed TC-E2E-02-switch PASS and TC-E2E-02-ack PASS |
| TC-E2E-03 | End-to-end | WAV chosen in the sound-lab screen | Screen shows a scored label | Headless Edge set a 1-second WAV and waited for Score from 0 to 1, which renders only after a classification with scores | PASS | qa/e2e_console.py printed TC-E2E-03 PASS |
| TC-E2E-04 | End-to-end | Register a sensor in the fleet screen | One-time token is shown | The token text was longer than 20 characters. The sensor was deleted after the run | PASS | qa/e2e_console.py printed TC-E2E-04 PASS. Cleanup left 0 rows for qa-e2e-node |
| TC-PERF-01 | Performance | GET /api/health | p95 ≤ 250 ms; error rate 0 | p50 3.8 ms; p95 13.4 ms; error rate 0; n=30 | PASS | qa/measure_qa_results.json |
| TC-PERF-02 | Performance | GET /api/devices | p95 ≤ 250 ms; error rate 0 | p50 11.2 ms; p95 21.7 ms; error rate 0; n=30 | PASS | qa/measure_qa_results.json |
| TC-PERF-03 | Performance | GET overview, practice, 6 h | p95 ≤ 800 ms; error rate 0 | p50 39.4 ms; p95 47.8 ms; error rate 0; n=20 | PASS | qa/measure_qa_results.json |
| TC-PERF-04 | Performance | GET forecast demo-road | p95 ≤ 8000 ms; error rate 0 | p50 2162.4 ms; p95 2380.3 ms; error rate 0; n=8 | PASS | qa/measure_qa_results.json |
| TC-PERF-05 | Performance | Warmed 1-second tone analysis | p95 ≤ 20000 ms; error rate 0 | p50 6530.6 ms; p95 6573.2 ms; error rate 0; n=3 | PASS | qa/measure_qa_results.json |
| TC-HW-01 | Hardware | Compile and flash the sketch | Sketch compiles | No board connected | BLOCKED | User excluded hardware |
| TC-HW-02 | Hardware | Live post from the board | A live row appears | No board connected | BLOCKED | User excluded hardware |
| TC-HW-03 | Hardware | Queue survives Wi-Fi loss only | One row per retried message | No board connected | BLOCKED | User excluded hardware |

## C. Defect report

| Defect ID | Component | Problem | Severity | Reproduction Steps | Fix Status | Retest Result |
| --- | --- | --- | --- | --- | --- | --- |
| DEF-001 | Audio analysis | First recognition on a console-less server returned unavailable with OSError 22 | High | Start `run.py` with no usable console. POST a WAV to `/api/audio/analyse`. | Fixed | PASS. Warmup returned Beep, bleep, available true |
| DEF-002 | Database | Practice rows had aged out of the default 6-hour view | High | Wait more than 6 hours after the seed, then GET the 6-hour practice overview | Fixed | PASS. total 1056, newest 2026-11-17T13:46:00+00:00 |
| DEF-003 | API | A duplicate observation still returned HTTP 201 | Medium | POST the same device and message identity twice | Fixed | PASS. unittest expects 201 then 200 |
| DEF-004 | API | A timestamp years in the past was stored | Medium | POST a zoned timestamp older than 48 hours | Fixed | PASS. unittest expects HTTP 422 for a time 3 days old |
| DEF-005 | Authentication | A restart replaced `data/admin-token.txt` | High | Start the server twice with `KAANAM_ADMIN_TOKEN` unset | Fixed | PASS. File hash unchanged on the 17 Nov 2026 restart (`token_unchanged=True`). Not repeated inside `measure_qa.py` |
| DEF-006 | Authentication | CSV download needs no viewer token | Medium | GET `/api/export.csv` with no token | Open | Still present. HTTP 200 in `measure_qa.py`. No fix was applied |
| DEF-007 | Frontend | Chart title and practice labels could be read as a decibel meter and as model output | Medium | Open the practice overview and read the chart title and the label mix | Fixed | PASS. Headless Edge waited for Unitless index over time and Practice seed. These names are not from the sound model. |
| DEF-008 | Frontend | Forecast text said “best fit” and hid the 24-hour window | Low | Open the short projection for one sensor | Fixed | PASS. Headless Edge selected demo-road and waited for last 24 hours and closest on past one-minute checks. |

A defect is closed only when its retest result is PASS. DEF-006 remains open.

## D. Requirements traceability matrix

| Requirement ID | Requirement | Related Test IDs | Result | Remaining Gap |
| --- | --- | --- | --- | --- |
| FR1 | Store a unitless 0–1 index and say it is not SPL, dB(A), or LAeq | TC-API-01, TC-API-05, TC-DB-04, TC-FE-04 | Pass for the software wording | Level bounds passed, and the browser showed the unitless title. No sound-level meter comparison was made |
| FR2 | Keep practice readings separate from live sensor readings | TC-DB-03, TC-DB-04, TC-E2E-02 | Pass | The browser switch showed an empty live range, then restored the practice seed caption |
| FR3 | Device token on posts; admin token to register, change the line, and mark an alert seen | TC-AUTH-01, TC-AUTH-02, TC-AUTH-03, TC-AUTH-04, TC-AUTH-05, TC-AUTH-06, TC-AUTH-07 | Partial | Write paths passed. Viewer control on reads was not an executed acceptance test. DEF-006 is open |
| FR4 | One stored row per device and message identity | TC-DB-01, TC-DB-06 | Partial | Sequential retry passed. Overlapping posts were not run |
| FR5 | Store quality flags and keep them out of averages, alerts, and the forecast | TC-DB-02 | Partial | Clipping passed in the unit test. Wind and clock flags were not posted. The board that would send them was not connected |
| FR6 | Open an alert on a clean reading at or above the saved line, and let an admin mark it seen | TC-AUTH-05, TC-AUTH-06, TC-E2E-02 | Pass for this software path | The browser marked the QA sensor alert Seen. The reading was posted by the test script, not by a board |
| FR7 | Local recognition, top scores, uncertain below 0.35, and an unavailable state when the model cannot run | TC-AUD-01, TC-AUD-03, TC-AUD-04, TC-AUD-05, TC-AUD-06, TC-AUD-07, TC-E2E-03 | Pass for the software branches | Uncertain, missing-weights, and optional-classifier cases passed. Field accuracy was not tested |
| FR8 | One-sensor forecast, baselines, forest only after 40 minutes, no use of future minutes | TC-API-02, TC-FCT-01, TC-FCT-02, TC-FCT-03, TC-FCT-04, TC-FCT-05 | Pass for the software rules | The 20-point series returned the three baselines only. Section F is synthetic only |

## E. Performance results

Targets were written in `qa/measure_qa.py` and printed as `TARGETS_LOCKED` before any timed sample. They were not changed after the run.

Machine: the table in Environment. One client. Concurrency 1. Latency is milliseconds, nearest-rank on the sorted sample, index `round((percentile/100) × (n−1))`.

The sound-model warmup is excluded from TC-PERF-05. That warmup was one POST of the same 1-second 1 kHz tone: HTTP 200, 33959.9 ms, label Beep, bleep, available true. The three timed audio calls were scored on HTTP status only. Their response bodies were not parsed.

Forecast timing includes fitting the random forest on that request. It does not include the sound-model load.

The whole measurement script, including warmup and the horizon calculation, took 82.3 seconds of wall clock. The latency figures below are only the timed samples.

| Operation | Workload / Concurrency | Requests | p50 Latency | p95 Latency | Error Rate | Acceptance Target | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/health | Sequential, concurrency 1 | 30 | 3.8 ms | 13.4 ms | 0% | p95 ≤ 250 ms and error rate 0 | PASS |
| GET /api/devices | Sequential, concurrency 1 | 30 | 11.2 ms | 21.7 ms | 0% | p95 ≤ 250 ms and error rate 0 | PASS |
| GET /api/overview, practice, 6 h | Sequential, concurrency 1 | 20 | 39.4 ms | 47.8 ms | 0% | p95 ≤ 800 ms and error rate 0 | PASS |
| GET /api/forecast, demo-road | Sequential, concurrency 1, forest fit included | 8 | 2162.4 ms | 2380.3 ms | 0% | p95 ≤ 8000 ms and error rate 0 | PASS |
| POST /api/audio/analyse, 1 s sine, warmed | Sequential, concurrency 1, model already loaded | 3 | 6530.6 ms | 6573.2 ms | 0% | p95 ≤ 20000 ms and error rate 0 | PASS |

No concurrent workload was run. There is no result for more than one client at a time.

## F. Forecast evaluation

Data scenario for every row: synthetic practice seed, sensor `demo-road`, minute means from `GET /api/overview?source=demo&device_id=demo-road&hours=24`. Series length 361. Origins: the last 20 indexes that have at least 40 earlier minutes and six future minutes. The same 20 origins are used for every method and every horizon. Each fit sees only minutes before its origin.

MAE and RMSE are on the unitless index. Skill versus persistence is `1 − (MAE ÷ persistence MAE)` for that horizon. Persistence MAE was not zero on any horizon, so skill is reported. A negative skill means a larger MAE than persistence.

This is not a field result and it is not an independent holdout week.

| Data Scenario | Horizon | Method | Evaluation Points | MAE | RMSE | Skill vs Persistence |
| --- | --- | --- | --- | --- | --- | --- |
| Synthetic practice seed, demo-road minute means | 1 min | Persistence | 20 | 0.0483 | 0.0579 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 1 min | Moving average | 20 | 0.0411 | 0.0480 | 0.1499 |
| Synthetic practice seed, demo-road minute means | 1 min | Linear trend | 20 | 0.0435 | 0.0506 | 0.1003 |
| Synthetic practice seed, demo-road minute means | 1 min | Random Forest AI | 20 | 0.0392 | 0.0484 | 0.1883 |
| Synthetic practice seed, demo-road minute means | 2 min | Persistence | 20 | 0.0472 | 0.0590 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 2 min | Moving average | 20 | 0.0388 | 0.0459 | 0.1782 |
| Synthetic practice seed, demo-road minute means | 2 min | Linear trend | 20 | 0.0463 | 0.0516 | 0.0175 |
| Synthetic practice seed, demo-road minute means | 2 min | Random Forest AI | 20 | 0.0355 | 0.0433 | 0.2464 |
| Synthetic practice seed, demo-road minute means | 3 min | Persistence | 20 | 0.0560 | 0.0670 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 3 min | Moving average | 20 | 0.0389 | 0.0472 | 0.3047 |
| Synthetic practice seed, demo-road minute means | 3 min | Linear trend | 20 | 0.0479 | 0.0574 | 0.1438 |
| Synthetic practice seed, demo-road minute means | 3 min | Random Forest AI | 20 | 0.0411 | 0.0468 | 0.2664 |
| Synthetic practice seed, demo-road minute means | 4 min | Persistence | 20 | 0.0503 | 0.0594 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 4 min | Moving average | 20 | 0.0373 | 0.0448 | 0.2574 |
| Synthetic practice seed, demo-road minute means | 4 min | Linear trend | 20 | 0.0467 | 0.0564 | 0.0714 |
| Synthetic practice seed, demo-road minute means | 4 min | Random Forest AI | 20 | 0.0403 | 0.0462 | 0.1992 |
| Synthetic practice seed, demo-road minute means | 5 min | Persistence | 20 | 0.0419 | 0.0568 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 5 min | Moving average | 20 | 0.0374 | 0.0483 | 0.1081 |
| Synthetic practice seed, demo-road minute means | 5 min | Linear trend | 20 | 0.0489 | 0.0621 | -0.1662 |
| Synthetic practice seed, demo-road minute means | 5 min | Random Forest AI | 20 | 0.0453 | 0.0512 | -0.0810 |
| Synthetic practice seed, demo-road minute means | 6 min | Persistence | 20 | 0.0523 | 0.0651 | 0.0000 |
| Synthetic practice seed, demo-road minute means | 6 min | Moving average | 20 | 0.0381 | 0.0491 | 0.2716 |
| Synthetic practice seed, demo-road minute means | 6 min | Linear trend | 20 | 0.0544 | 0.0658 | -0.0394 |
| Synthetic practice seed, demo-road minute means | 6 min | Random Forest AI | 20 | 0.0487 | 0.0540 | 0.0697 |

## G. Final readiness assessment

| Area | Readiness | Supporting Evidence | Unresolved Issue |
| --- | --- | --- | --- |
| API | Ready with limitations | TC-API-01 through TC-API-08 passed | /docs and the demo tick were not run |
| Authentication | Ready with limitations | Write and acknowledge tests passed | DEF-006 is open: reads and export have no viewer token |
| Database | Ready with limitations | Separation, clipping, and sequential dedup passed | Overlapping duplicate posts were not run |
| Audio analysis | Ready with limitations | All seven audio cases passed, including the uncertain, missing-weights, and optional-classifier branches | Field accuracy was not tested |
| Forecasting | Ready with limitations | The under-40 series returned three baselines. Section F is computed | Section F uses the synthetic practice seed only |
| Frontend | Ready for the checked screens | Browser retests of DEF-007 and DEF-008 passed | No live board was shown on the console |
| End-to-end | Ready with limitations | Filter switch, alert acknowledgement, sound-lab WAV, and registration passed in headless Edge | The posted reading came from the test script. The QA sensor was removed afterwards |
| Performance | Ready with limitations | Five sequential targets passed on this laptop | No concurrent clients. First sound-model load was 34.0 s and was excluded |
| Hardware | Not assessed | No board was connected | TC-HW-01, TC-HW-02, TC-HW-03 blocked |
| Field accuracy | Not assessed | No meter comparison and no labelled field set | Not run |

## Evidence log

Commands run for this report, from the project directory:

```text
python -m unittest discover -s tests -v
```

Result: 12 tests, OK, 24.999 s. The three added cases are the uncertain label, the missing-weights state, and the optional classifier. The under-40 forecast assertion is inside `test_forecast`.

```text
.\.venv\Scripts\python.exe qa\measure_qa.py
```

Result: exit 0 in 82.3 s. Raw numbers are in `qa/measure_qa_results.json`. Targets were printed before the samples.

Follow-up reads, all on 17 November 2026 UTC:

- `GET /api/health` → 200, status ok
- `GET /api/forecast?source=demo&device_id=all` → 422, “Select one device for forecasting.”
- `GET /api/ai/status` → 200, weights_available true, loaded true
- `GET http://127.0.0.1:8000/` → 200, contains Kaanam and 127.0.0.1:3000
- `GET http://127.0.0.1:3000/` → 200, 38861 bytes
- `GET http://127.0.0.1:3000/api/health` → 200

```text
.\.venv\Scripts\python.exe qa\e2e_console.py
```

Result: exit 0 in 15.1 s. Printed lines: TC-FE-04 PASS, TC-E2E-02-switch PASS, TC-E2E-04 PASS, TC-E2E-02-ack PASS, TC-E2E-03 PASS. After cleanup, `qa-e2e-node` had 0 device rows, 0 observation rows, and 0 alert rows.

A separate headless Edge check selected sensor `demo-road` and waited for the text `last 24 hours` and `closest on past one-minute checks`. Both waits completed. That check is the retest for DEF-008.

## Close

Overall readiness for a software demonstration on this laptop, using practice data: **Ready with limitations**.

Unresolved critical defects: **0**. Unresolved high-severity defects: **0**.

Not closed: DEF-006 (Medium, open). DEF-007 and DEF-008 retested PASS.

Blocked tests: TC-HW-01, TC-HW-02, TC-HW-03. Hardware stays at 0% execution coverage because no board is connected.

Not run: TC-API-09, TC-API-10, TC-AUTH-07, TC-DB-06.

Audio analysis execution coverage is 7/7 = 100%. End-to-end execution coverage is 4/4 = 100%. Overall execution coverage is 45/52 = 86.5%.

Hardware was not tested. Field accuracy was not tested. The 12 passing integration tests and the browser checks do not show that the product has zero defects.
