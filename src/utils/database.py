"""SQLite database setup and helpers."""

import sqlite3
import os


def get_connection(db_path="cheater.db"):
    """Get a SQLite connection with WAL mode for concurrent reads."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def setup_tables(db_path="cheater.db"):
    """Create all database tables if they don't exist."""
    conn = get_connection(db_path)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS game_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            cookies REAL,
            cps REAL,
            prestige INTEGER,
            buildings_total INTEGER,
            upgrades_owned INTEGER,
            phase TEXT,
            elder_wrath INTEGER DEFAULT 0,
            wrinklers INTEGER DEFAULT 0,
            lumps INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bot_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            module TEXT,
            action TEXT,
            detail TEXT
        );

        CREATE TABLE IF NOT EXISTS ascension_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            prestige_before INTEGER,
            prestige_after INTEGER,
            heavenly_chips_spent INTEGER,
            run_duration_seconds INTEGER
        );
    """)

    conn.commit()
    conn.close()


def save_snapshot(db_path, status):
    """Save a game state snapshot to the database."""
    conn = get_connection(db_path)

    buildings_total = sum(b["amount"] for b in status.get("buildings", []))

    conn.execute(
        """INSERT INTO game_snapshots
           (cookies, cps, prestige, buildings_total, upgrades_owned, phase, elder_wrath, wrinklers, lumps)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            status.get("cookies", 0),
            status.get("cps", 0),
            status.get("prestige", 0),
            buildings_total,
            status.get("upgradesOwned", 0),
            status.get("phase", "unknown"),
            status.get("elderWrath", 0),
            status.get("wrinklers", 0),
            status.get("lumps", 0),
        )
    )

    conn.commit()
    conn.close()


def get_recent_snapshots(db_path, limit=100):
    """Get recent game snapshots."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM game_snapshots ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def save_action(db_path, module, action, detail=""):
    """Log a bot action."""
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO bot_actions (module, action, detail) VALUES (?, ?, ?)",
        (module, action, detail)
    )
    conn.commit()
    conn.close()


def get_recent_actions(db_path, limit=50):
    """Get recent bot actions."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM bot_actions ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]
