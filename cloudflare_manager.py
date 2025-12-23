import subprocess
import re
import requests

FIREBASE_URL = "https://civilai-e26f8-default-rtdb.asia-southeast1.firebasedatabase.app/url.json"

def get_and_push_tunnel_url():
    cmd = ["cloudflared", "tunnel", "--url", "http://localhost:8000"]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    for line in process.stdout:
        print(line.strip())
        match = re.search(r"https://.*\.trycloudflare\.com", line)
        if match:
            url = match.group(0)
            print("✅ Found tunnel:", url)
            requests.patch(FIREBASE_URL, json={"url": url})
            break

def get_cloudflare_url(port=8000):
    cmd = ["cloudflared", "tunnel", "--url", f"http://localhost:{port}"]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    for line in process.stdout:
        print(line.strip())
        match = re.search(r"https://.*\.trycloudflare\.com", line)
        if match:
            return match.group(0)
    return None
