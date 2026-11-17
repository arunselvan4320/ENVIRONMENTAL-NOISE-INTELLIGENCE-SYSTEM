"""Browser checks for the areas that were not run. Uses the installed Edge browser."""
import io
import json
import sqlite3
import urllib.request
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "noise.db"
TOKEN_FILE = ROOT / "data" / "admin-token.txt"
DEVICE = "qa-e2e-node"
BASE = "http://127.0.0.1:3000"
API = "http://127.0.0.1:8000"


def tone_path():
    path = Path(__file__).resolve().parent / "e2e-tone.wav"
    rate = 16000
    samples = (np.sin(2 * np.pi * 1000 * np.arange(rate) / rate) * 10000).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())
    return path


def post_observation(device_token):
    body = json.dumps({
        "device_id": DEVICE,
        "message_id": "e2e-1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level_index": 0.95,
    }).encode()
    request = urllib.request.Request(
        API + "/api/observations",
        data=body,
        headers={"Content-Type": "application/json", "X-Device-Token": device_token},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.status


def cleanup():
    if not DB.is_file():
        return
    connection = sqlite3.connect(DB)
    try:
        ids = [row[0] for row in connection.execute("SELECT id FROM observations WHERE device_id=?", (DEVICE,))]
        for observation_id in ids:
            connection.execute("DELETE FROM ai_events WHERE observation_id=?", (observation_id,))
            connection.execute("DELETE FROM alerts WHERE observation_id=?", (observation_id,))
        connection.execute("DELETE FROM observations WHERE device_id=?", (DEVICE,))
        connection.execute("DELETE FROM devices WHERE id=?", (DEVICE,))
        connection.commit()
    finally:
        connection.close()


def main():
    cleanup()
    admin = TOKEN_FILE.read_text(encoding="utf-8").strip()
    wav = tone_path()
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(90000)
        try:
            page.goto(BASE, wait_until="networkidle")
            page.get_by_text("Unitless index over time").wait_for()
            page.get_by_text("Practice seed. These names are not from the sound model.").wait_for()
            results.append("TC-FE-04 PASS")
            page.get_by_label("Which readings to show").select_option("live")
            page.get_by_text("No readings in this time range.").wait_for()
            page.get_by_label("Which readings to show").select_option("demo")
            page.get_by_text("Practice seed. These names are not from the sound model.").wait_for()
            results.append("TC-E2E-02-switch PASS")
            page.locator('button[title="Settings"]').click()
            page.get_by_role("button", name="Admin access").click()
            page.get_by_placeholder("Admin token").fill(admin)
            page.get_by_role("button", name="Unlock admin tools").click()
            page.get_by_text("Admin tools unlocked").wait_for()
            page.locator('button[title="Device Fleet"]').click()
            page.get_by_role("button", name="Register a sensor").click()
            page.get_by_label("Sensor ID").fill(DEVICE)
            page.get_by_label("Name").fill("QA sensor")
            page.get_by_label("Place").fill("Bench")
            page.get_by_role("button", name="Create sensor").click()
            token = page.locator("p.break-all").inner_text().strip()
            if len(token) < 20:
                raise RuntimeError("device token was not shown")
            results.append("TC-E2E-04 PASS")
            page.get_by_role("button", name="Close").click()
            status = post_observation(token)
            if status not in (200, 201):
                raise RuntimeError(f"observation status {status}")
            page.get_by_label("Which readings to show").select_option("live")
            page.locator('button[title="Rules"]').click()
            card = page.locator("article").filter(has_text="QA sensor")
            card.wait_for()
            card.get_by_role("button", name="Mark as seen").click()
            card.get_by_text("Seen", exact=True).wait_for()
            results.append("TC-E2E-02-ack PASS")
            page.locator('button[title="Live Stream"]').click()
            page.locator('input[aria-label="Choose a WAV file"]').set_input_files(str(wav))
            page.get_by_text("Score from 0 to 1.").wait_for()
            results.append("TC-E2E-03 PASS")
        finally:
            browser.close()
            cleanup()
            if wav.is_file():
                wav.unlink()
            print("\n".join(results))


if __name__ == "__main__":
    main()
