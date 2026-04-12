"""Chrome DevTools Protocol connection for Cookie Clicker browser integration."""

import json
import requests
import websocket


class ChromeConnection:
    """Connects to Chrome via DevTools Protocol to execute JavaScript in Cookie Clicker."""

    def __init__(self, port=9222):
        self.port = port
        self.base_url = f"http://localhost:{port}"
        self.ws = None
        self.ws_url = None
        self._msg_id = 0

    def find_cookie_clicker_tab(self):
        """Find the Cookie Clicker tab among open Chrome tabs."""
        try:
            response = requests.get(f"{self.base_url}/json", timeout=5)
            response.raise_for_status()
        except requests.ConnectionError:
            raise ConnectionError(
                f"Cannot connect to Chrome on port {self.port}.\n"
                f"Make sure Chrome is running with: chrome.exe --remote-debugging-port={self.port}\n"
                f"Close all Chrome windows first, then relaunch with this flag."
            )
        except requests.Timeout:
            raise ConnectionError(f"Timeout connecting to Chrome on port {self.port}.")

        tabs = response.json()
        for tab in tabs:
            url = tab.get("url", "")
            title = tab.get("title", "")
            if "cookieclicker" in url.lower() or "cookie clicker" in title.lower():
                ws_url = tab.get("webSocketDebuggerUrl")
                if ws_url:
                    self.ws_url = ws_url
                    return ws_url
                raise RuntimeError(
                    f"Found Cookie Clicker tab but no websocket URL. "
                    f"Is another debugger already connected?"
                )

        tab_urls = [t.get("url", "?") for t in tabs]
        raise RuntimeError(
            f"Cookie Clicker tab not found among {len(tabs)} tabs.\n"
            f"Open Cookie Clicker at https://orteil.dashnet.org/cookieclicker/\n"
            f"Found tabs: {tab_urls[:5]}"
        )

    def connect(self):
        """Establish websocket connection to the Cookie Clicker tab."""
        if not self.ws_url:
            self.find_cookie_clicker_tab()
        self.ws = websocket.create_connection(self.ws_url, timeout=10)

    def evaluate_js(self, expression):
        """Execute JavaScript in the Cookie Clicker page and return the result."""
        if not self.ws:
            self.connect()

        self._msg_id += 1
        msg = json.dumps({
            "id": self._msg_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": True
            }
        })

        try:
            self.ws.send(msg)
            for _ in range(10):
                raw = self.ws.recv()
                response = json.loads(raw)
                if response.get("id") == self._msg_id:
                    break
            else:
                response = {}
        except (websocket.WebSocketConnectionClosedException, BrokenPipeError):
            self.ws = None
            self.connect()
            self._msg_id += 1
            msg = json.dumps({
                "id": self._msg_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "returnByValue": True
                }
            })
            self.ws.send(msg)
            for _ in range(10):
                raw = self.ws.recv()
                response = json.loads(raw)
                if response.get("id") == self._msg_id:
                    break
            else:
                response = {}

        if "error" in response:
            raise RuntimeError(f"CDP error: {response['error']}")

        result = response.get("result", {}).get("result", {})

        if result.get("type") == "undefined":
            return None

        value = result.get("value")

        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                pass

        return value

    def close(self):
        """Close the websocket connection."""
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None

    def __enter__(self):
        self.find_cookie_clicker_tab()
        self.connect()
        return self

    def __exit__(self, *args):
        self.close()
