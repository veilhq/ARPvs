"""
ARPvs entry point.

Starts the FastAPI backend and either:
  - Opens a PyWebView native window (default)
  - Runs in dev mode with browser access (--dev flag)
"""

import sys
import threading
import uvicorn

from src.config import load_config


def start_server(config):
    """Start the FastAPI/Uvicorn server."""
    uvicorn.run(
        "src.main:app",
        host="127.0.0.1",
        port=config["port"],
        log_level="info",
        reload=False,
    )


def start_desktop(config):
    """Start PyWebView native window pointing at the local server."""
    import webview

    url = f"http://127.0.0.1:{config['port']}"
    window_cfg = config.get("window", {})

    webview.create_window(
        title=window_cfg.get("title", "ARPvs"),
        url=url,
        width=window_cfg.get("width", 1200),
        height=window_cfg.get("height", 800),
        min_size=(800, 500),
    )
    webview.start()


def main():
    config = load_config()
    dev_mode = "--dev" in sys.argv

    if dev_mode:
        # Dev mode: just run the server, access via browser
        print(f"[ARPvs] Dev server at http://127.0.0.1:{config['port']}")
        start_server(config)
    else:
        # Production: start server in background, open native window
        server_thread = threading.Thread(
            target=start_server, args=(config,), daemon=True
        )
        server_thread.start()
        start_desktop(config)


if __name__ == "__main__":
    main()
