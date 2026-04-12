"""SQLite database setup and helpers — persistent storage across restarts."""

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
        -- Game state snapshots (every 30s)
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

        -- Bot action log (persistent across restarts)
        CREATE TABLE IF NOT EXISTS bot_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            module TEXT,
            action TEXT,
            detail TEXT
        );

        -- Ascension history
        CREATE TABLE IF NOT EXISTS ascension_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            prestige_before INTEGER,
            prestige_after INTEGER,
            heavenly_chips_spent INTEGER,
            run_duration_seconds INTEGER
        );

        -- Market price history (deduped, only stores changes)
        CREATE TABLE IF NOT EXISTS market_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            good_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            value REAL NOT NULL,
            delta REAL,
            mode INTEGER,
            dur INTEGER,
            stock INTEGER,
            max_stock INTEGER,
            resting REAL,
            ratio REAL,
            signal TEXT,
            score INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_market_good_time
            ON market_prices(good_id, timestamp);

        -- Market trade history (persistent P/L tracking)
        CREATE TABLE IF NOT EXISTS market_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            good_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            quantity INTEGER,
            price REAL,
            mode INTEGER,
            dur INTEGER,
            ratio REAL,
            score INTEGER,
            net_pct REAL,
            pnl REAL,
            reason TEXT
        );

        -- Market P/L snapshots (for charts)
        CREATE TABLE IF NOT EXISTS market_pnl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            total_pnl REAL,
            wins INTEGER,
            losses INTEGER,
            total_trades INTEGER
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


def save_market_prices(db_path, market_data):
    """Save market price snapshots (deduped — only stores changed values)."""
    if not market_data or not market_data.get("goods"):
        return

    conn = get_connection(db_path)

    for g in market_data["goods"]:
        # Dedup: skip if price hasn't changed since last record
        last = conn.execute(
            "SELECT value FROM market_prices WHERE good_id = ? ORDER BY id DESC LIMIT 1",
            (g["id"],)
        ).fetchone()

        if last and abs(last["value"] - g["val"]) < 0.001:
            continue

        conn.execute(
            """INSERT INTO market_prices
               (good_id, symbol, value, delta, mode, dur, stock, max_stock, resting, ratio, signal, score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                g["id"], g.get("symbol", ""), g["val"], g.get("delta", 0),
                g.get("modeId", 0), g.get("dur", 0),
                g.get("stock", 0), g.get("maxStock", 0),
                g.get("restingVal", 0), g.get("ratio", 0) / 100.0,
                g.get("signal", ""), g.get("score", 0),
            )
        )

    conn.commit()
    conn.close()


def save_market_trade(db_path, trade):
    """Log a market trade to the database."""
    conn = get_connection(db_path)
    conn.execute(
        """INSERT INTO market_trades
           (good_id, symbol, action, quantity, price, mode, dur, ratio, score, net_pct, pnl, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            trade.get("good_id", 0), trade.get("symbol", ""),
            trade.get("action", ""), trade.get("quantity", 0),
            trade.get("price", 0), trade.get("mode", 0),
            trade.get("dur", 0), trade.get("ratio", 0),
            trade.get("score", 0),
            trade.get("net_pct", 0), trade.get("pnl", 0),
            trade.get("reason", ""),
        )
    )
    conn.commit()
    conn.close()


def save_market_pnl(db_path, stats):
    """Save a market P/L snapshot for charts."""
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO market_pnl (total_pnl, wins, losses, total_trades) VALUES (?, ?, ?, ?)",
        (stats.get("totalPnL", 0), stats.get("wins", 0),
         stats.get("losses", 0), stats.get("totalTrades", 0))
    )
    conn.commit()
    conn.close()


def save_bot_actions(db_path, actions):
    """Bulk save bot actions from the JS action log."""
    if not actions:
        return
    conn = get_connection(db_path)
    for a in actions:
        conn.execute(
            "INSERT INTO bot_actions (module, action, detail) VALUES (?, ?, ?)",
            (a.get("module", ""), a.get("action", ""), a.get("detail", ""))
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


def get_market_price_history(db_path, good_id=None, limit=500):
    """Get market price history for charts."""
    conn = get_connection(db_path)
    if good_id is not None:
        rows = conn.execute(
            "SELECT * FROM market_prices WHERE good_id = ? ORDER BY id DESC LIMIT ?",
            (good_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM market_prices ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_market_trades(db_path, limit=100):
    """Get recent market trades."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM market_trades ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_market_pnl_history(db_path, limit=200):
    """Get market P/L snapshots for charts."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM market_pnl ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_recent_actions(db_path, limit=50):
    """Get recent bot actions."""
    conn = get_connection(db_path)
    rows = conn.execute(
        "SELECT * FROM bot_actions ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]
