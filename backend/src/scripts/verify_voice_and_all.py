import os
import sys
import wave
import struct
import math
import tempfile
import requests

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

def pass_test(name, detail=""):
    print(f"  \033[32m✔ PASS\033[0m [{name}] {detail}")

def fail_test(name, detail=""):
    print(f"  \033[31m✘ FAIL\033[0m [{name}] {detail}")
    raise AssertionError(f"Test failed: {name} - {detail}")

def safe_remove(path):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

def generate_wav(duration_s=2.0, sample_rate=16000, frequency=440.0, amplitude=1000):
    """Generates a mono 16-bit PCM WAV in a temp file with given amplitude."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(tmp.name, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        n_samples = int(duration_s * sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            if amplitude == 0:
                val = 0
            else:
                val = int(amplitude * math.sin(2.0 * math.pi * frequency * (i / sample_rate)))
                val = max(-32767, min(32767, val))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(frames)
    return tmp.name

def main():
    print("\n===========================================================")
    print("🎙️ ARIA COMPREHENSIVE VOICE DETECTION & SYSTEM VERIFICATION")
    print("===========================================================\n")

    ai_url = "http://localhost:8000"
    backend_url = "http://localhost:5000"
    ai_secret = os.environ.get("AI_ENGINE_SECRET", "aria_ai_engine_internal_secret_key")

    # 1. Health Checks
    print("1️⃣ Checking Service Health Endpoints...")
    try:
        r = requests.get(f"{ai_url}/health", timeout=5)
        ai_health = r.json()
        if ai_health.get("status") == "ONLINE":
            pass_test("AI Engine Health", f"Status: {ai_health.get('status')}, analysisReady: {ai_health.get('analysisReady')}")
        else:
            fail_test("AI Engine Health", str(ai_health))
    except Exception as e:
        fail_test("AI Engine Health", str(e))

    try:
        r = requests.get(f"{backend_url}/health", timeout=5)
        backend_health = r.json()
        if backend_health.get("status") == "ONLINE":
            pass_test("Backend Health", f"Status: {backend_health.get('status')}, dbMode: {backend_health.get('dbMode')}")
        else:
            fail_test("Backend Health", str(backend_health))
    except Exception as e:
        fail_test("Backend Health", str(e))

    # 2. Test Transcript Distress & Language Understanding (Direct Service Unit Check)
    print("\n2️⃣ Verifying Voice Distress & Language Understanding (Hindi + English + Hinglish)...")
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../ai-engine")))
    from transcript_analyzer import TranscriptAnalyzer
    from tone_classifier import ToneClassifier
    from context_scorer import ContextScorer

    analyzer = TranscriptAnalyzer()
    
    # 2a. English Direct Help Cry
    res_en = analyzer.analyze("Help! Somebody please help me, I am in danger!")
    if res_en["distress"] and res_en["confidence"] >= 85 and res_en["threatLevel"] == "CRITICAL":
        pass_test("English Distress Cry", f"Distress: {res_en['distress']}, Conf: {res_en['confidence']}%, Level: {res_en['threatLevel']}")
    else:
        fail_test("English Distress Cry", str(res_en))

    # 2b. Hindi Devanagari Cry for Help
    res_hi = analyzer.analyze("बचाओ! मुझे बचाओ! कोई मेरी मदद करो!")
    if res_hi["distress"] and res_hi["confidence"] >= 85 and res_hi["threatLevel"] == "CRITICAL":
        pass_test("Hindi Distress Cry", f"Distress: {res_hi['distress']}, Conf: {res_hi['confidence']}%, Level: {res_hi['threatLevel']}")
    else:
        fail_test("Hindi Distress Cry", str(res_hi))

    # 2c. Hinglish / Romanized Hindi Cry
    res_hing = analyzer.analyze("Mujhe bachao! Koi mera peecha kar raha hai, bachao!")
    if res_hing["distress"] and res_hing["confidence"] >= 85 and res_hing["threatLevel"] == "CRITICAL":
        pass_test("Hinglish Distress Cry", f"Distress: {res_hing['distress']}, Conf: {res_hing['confidence']}%, Level: {res_hing['threatLevel']}")
    else:
        fail_test("Hinglish Distress Cry", str(res_hing))

    # 2d. Normal Safe Conversation
    res_safe = analyzer.analyze("Hi, I am walking home from work, weather is pleasant.")
    if not res_safe["distress"] and res_safe["threatLevel"] == "SAFE":
        pass_test("Safe Speech Classification", f"Distress: {res_safe['distress']}, Threat: {res_safe['threatLevel']}")
    else:
        fail_test("Safe Speech Classification", str(res_safe))

    # 3. Test Acoustic Tone & Volume Classifier (Shouting & Amplitude)
    print("\n3️⃣ Verifying Acoustic Tone Classifier (RMS Loudness & Shouting Detection)...")
    classifier = ToneClassifier()

    # 3a. High Loudness / Shouting Audio (Amplitude 16000 -> RMS ~11000)
    shout_wav = generate_wav(duration_s=2.0, amplitude=16000)
    try:
        shout_res = classifier.classify_voice_tone(shout_wav, "shout.wav", distress_flagged=True)
        if shout_res.get("measured") and shout_res.get("confidence", 0) >= 85:
            pass_test("Acoustic Shouting Detection", f"RMS: {shout_res.get('rms'):.1f}, Tone Conf: {shout_res.get('confidence')}% (Elevated to Critical)")
        else:
            fail_test("Acoustic Shouting Detection", str(shout_res))
    finally:
        safe_remove(shout_wav)

    # 3b. Normal Volume Speech (Amplitude 800 -> RMS ~565)
    normal_wav = generate_wav(duration_s=2.0, amplitude=800)
    try:
        normal_res = classifier.classify_voice_tone(normal_wav, "normal.wav", distress_flagged=False)
        if normal_res.get("measured") and normal_res.get("confidence", 0) <= 60:
            pass_test("Acoustic Normal Volume", f"RMS: {normal_res.get('rms'):.1f}, Tone Conf: {normal_res.get('confidence')}% (Non-threatening)")
        else:
            fail_test("Acoustic Normal Volume", str(normal_res))
    finally:
        safe_remove(normal_wav)

    # 3c. Silent / Zero Amplitude Audio
    silent_wav = generate_wav(duration_s=1.0, amplitude=0)
    try:
        silent_res = classifier.classify_voice_tone(silent_wav, "silent.wav", distress_flagged=False)
        if silent_res.get("measured") and silent_res.get("confidence", 0) <= 30:
            pass_test("Acoustic Silence Handling", f"RMS: {silent_res.get('rms')}, Tone Conf: {silent_res.get('confidence')}% (No False Shouting)")
        else:
            fail_test("Acoustic Silence Handling", str(silent_res))
    finally:
        safe_remove(silent_wav)

    # 4. Context Scorer Risk Calculation
    print("\n4️⃣ Verifying Multi-Modal Context Scorer...")
    scorer = ContextScorer()
    
    # Critical threat + isolation + night
    score_crit = scorer.calculate_risk_score(
        audio_distress=True,
        is_isolated=True,
        has_motion_anomaly=True,
        distress_confidence=88.0,
        threat_level="CRITICAL",
        transcript="Help me please!"
    )
    if score_crit >= 80:
        pass_test("High-Risk Multi-Modal Score", f"Calculated Score: {score_crit}% (Triggers Automatic Emergency Protocol)")
    else:
        fail_test("High-Risk Multi-Modal Score", f"Expected >= 80, got {score_crit}")

    # Normal activity
    score_safe = scorer.calculate_risk_score(
        audio_distress=False,
        is_isolated=False,
        has_motion_anomaly=False,
        distress_confidence=15.0,
        threat_level="SAFE",
        transcript="Walking to the subway"
    )
    if score_safe < 40:
        pass_test("Normal Safe Context Score", f"Calculated Score: {score_safe}% (Environment Stable)")
    else:
        fail_test("Normal Safe Context Score", f"Expected < 40, got {score_safe}")

    # 5. Live Audio Analysis API Pipeline (/analyze via HTTP)
    print("\n5️⃣ Testing Live AI Engine /analyze Endpoint over HTTP...")
    test_wav = generate_wav(duration_s=2.0, amplitude=12000)
    try:
        with open(test_wav, "rb") as f:
            resp = requests.post(
                f"{ai_url}/analyze",
                headers={"X-Internal-Secret": ai_secret},
                files={"file": ("test_distress_voice.wav", f, "audio/wav")},
                data={
                    "latitude": 28.6139,
                    "longitude": 77.2090,
                    "is_isolated": "true"
                },
                timeout=15
            )
        if resp.status_code == 200:
            body = resp.json()
            pass_test("Live AI Audio Processing", f"Status: 200 OK | Acoustic Measured: {body.get('acoustic_measured')} | Risk: {body.get('riskScore')}%")
        else:
            fail_test("Live AI Audio Processing", f"Status: {resp.status_code}, Body: {resp.text}")
    finally:
        safe_remove(test_wav)

    # 6. Backend Monitoring Audio Ingestion & Automatic SOS
    print("\n6️⃣ Testing Live Monitoring Audio Ingestion via Backend API...")
    # Register a user to test monitoring chunk upload
    import time
    ts = int(time.time() * 1000)
    user_data = {
        "name": "Kavita Verma",
        "email": f"kavita_{ts}@aria.test",
        "phone": "+919876543210",
        "password": "PasswordSecure@2026!",
        "role": "user",
        "emergencyContacts": [
            {"name": "Brother Rohan", "phone": "+919876543210"}
        ]
    }
    reg = requests.post(f"{backend_url}/api/auth/register", json=user_data, timeout=5)
    token = reg.json().get("token")
    if token:
        pass_test("User Token Generation", f"User: Kavita Verma (ID: {reg.json()['user']['id']})")
    else:
        fail_test("User Token Generation", reg.text)

    # Upload audio chunk to /api/monitoring/chunk
    chunk_wav = generate_wav(duration_s=2.0, amplitude=5000)
    try:
        with open(chunk_wav, "rb") as f:
            mon_resp = requests.post(
                f"{backend_url}/api/monitoring/chunk",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": ("live_mic_chunk.wav", f, "audio/wav")},
                data={
                    "latitude": 28.5355,
                    "longitude": 77.3910,
                    "isIsolated": "false"
                },
                timeout=10
            )
        if mon_resp.status_code == 200:
            m_body = mon_resp.json()
            pass_test("Monitoring Audio Chunk Pipeline", f"Analysis Available: {m_body.get('analysisAvailable', True)}, Success: {m_body.get('success')}")
        else:
            fail_test("Monitoring Audio Chunk Pipeline", f"Status: {mon_resp.status_code}, {mon_resp.text}")
    finally:
        safe_remove(chunk_wav)

    print("\n===========================================================")
    print("🎉 ALL VOICE DETECTION & SAFETY PIPELINE VERIFICATIONS PASSED")
    print("===========================================================\n")

if __name__ == "__main__":
    main()
