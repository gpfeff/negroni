#!/usr/bin/env python3
"""Fixture-only bridge to the existing Meta Ads Intelligence SQLite engine.

This adapter never performs network collection. It converts repository-owned,
sanitized example.invalid fixture media into deterministic in-memory downloads,
then asks the existing engine to own ingestion, lifecycle, media, and families.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib
import json
import os
import shutil
import sqlite3
import sys
from pathlib import Path
from typing import Any


MAX_FIXTURE_MEDIA_BYTES = 8 * 1024 * 1024
MIN_FREE_BYTES_AFTER_WRITE = 16 * 1024 * 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--engine-root", required=True)
    parser.add_argument("--profile-root", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--watch-id", required=True)
    parser.add_argument("--page-id", required=True)
    parser.add_argument("--payload", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--observed-at", required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_fixture_media(
    destination_stem: Path,
    content: bytes,
    media_type: str,
    *,
    max_bytes: int = MAX_FIXTURE_MEDIA_BYTES,
) -> tuple[Path, str, int]:
    """Publish bounded synthetic fixture bytes without partial or overwrite risk."""
    if media_type not in {"image", "video"}:
        raise ValueError("fixture media type is not allowed")
    if not isinstance(content, bytes) or not content:
        raise ValueError("fixture media bytes are empty")
    if max_bytes <= 0 or len(content) > max_bytes:
        raise ValueError("fixture media exceeds the configured size limit")

    parent = destination_stem.parent
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if shutil.disk_usage(parent).free - len(content) < MIN_FREE_BYTES_AFTER_WRITE:
        raise OSError("fixture media disk headroom check failed")

    digest = hashlib.sha256(content).hexdigest()
    extension = ".mp4" if media_type == "video" else ".png"
    destination = parent / f"{digest}{extension}"
    if destination.exists():
        if destination.read_bytes() != content:
            raise ValueError("fixture media collision")
        os.chmod(destination, 0o600)
        return destination, digest, len(content)

    temporary = parent / f".{digest}.{os.getpid()}.tmp"
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        view = memoryview(content)
        written = 0
        while written < len(view):
            written += os.write(descriptor, view[written:])
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        # A hard link publishes the complete temp file atomically and refuses to
        # overwrite a destination created by another writer.
        os.link(temporary, destination)
        os.chmod(destination, 0o600)
        directory_descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    except FileExistsError:
        if not destination.exists() or destination.read_bytes() != content:
            raise ValueError("fixture media collision")
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)
    return destination, digest, len(content)


def load_fixture(path: Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("ads"), list):
        raise ValueError("fixture payload must contain an ads array")
    media_bytes: dict[str, bytes] = {}
    for ad in payload["ads"]:
        if not isinstance(ad, dict):
            raise ValueError("fixture ads must be objects")
        for item in ad.get("media", []):
            if not isinstance(item, dict):
                raise ValueError("fixture media must be objects")
            source_url = str(item.get("url", ""))
            if not source_url.startswith("https://example.invalid/"):
                raise ValueError("fixture media must use example.invalid")
            encoded = item.pop("fixture_bytes_base64", None)
            if not isinstance(encoded, str):
                raise ValueError("fixture media bytes are missing")
            content = base64.b64decode(encoded, validate=True)
            digest = hashlib.sha256(content).hexdigest()
            suffix = ".mp4" if item.get("type") == "video" else ".png"
            synthetic_url = f"https://scontent.xx.fbcdn.net/negroni-fixture/{digest}{suffix}"
            item["url"] = synthetic_url
            media_bytes[synthetic_url] = content
    return payload, media_bytes


def rows(connection: sqlite3.Connection, query: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(query, parameters).fetchall()]


def inspect_engine(core: Any, root: Path, run_id: str, idempotent: bool) -> dict[str, Any]:
    connection = core.connect(root)
    try:
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        counts = {
            "ads": connection.execute("SELECT COUNT(*) FROM ads").fetchone()[0],
            "content_versions": connection.execute("SELECT COUNT(*) FROM ad_content_versions").fetchone()[0],
            "observations": connection.execute("SELECT COUNT(*) FROM ad_observations").fetchone()[0],
            "present_observations": connection.execute("SELECT COUNT(*) FROM ad_observations WHERE is_present=1").fetchone()[0],
            "absent_observations": connection.execute("SELECT COUNT(*) FROM ad_observations WHERE is_present=0").fetchone()[0],
            "media_objects": connection.execute("SELECT COUNT(*) FROM media_objects").fetchone()[0],
            "creative_families": connection.execute("SELECT COUNT(*) FROM creative_families").fetchone()[0],
            "family_members": connection.execute("SELECT COUNT(*) FROM family_members").fetchone()[0],
            "nightly_runs": connection.execute("SELECT COUNT(*) FROM nightly_runs").fetchone()[0],
            "watch_runs": connection.execute("SELECT COUNT(*) FROM watch_runs").fetchone()[0],
        }
        ads = rows(
            connection,
            """SELECT a.library_id, a.page_id, a.page_name, a.ad_library_url,
                      a.first_seen_at, a.last_seen_at, a.ad_text, a.landing_url,
                      a.content_hash, a.current_content_version_id,
                      wa.lifecycle_status, wa.consecutive_complete_absences,
                      COUNT(DISTINCT CASE WHEN o.is_present=1 THEN substr(o.observed_at,1,10) END) AS observed_days,
                      COUNT(DISTINCT CASE WHEN o.is_present=1 THEN o.watch_run_id END) AS successful_observations,
                      MIN(fm.family_id) AS family_id
                 FROM ads a
                 JOIN watch_ads wa ON wa.library_id=a.library_id
                 LEFT JOIN ad_observations o ON o.library_id=a.library_id
                 LEFT JOIN family_members fm ON fm.library_id=a.library_id
                GROUP BY a.library_id, wa.watch_id
                ORDER BY a.library_id""",
        )
        families = rows(
            connection,
            """SELECT cf.id, cf.advertiser_key, cf.media_type, cf.basis,
                      COUNT(DISTINCT fm.library_id) AS related_ad_ids,
                      GROUP_CONCAT(DISTINCT fm.library_id) AS library_ids
                 FROM creative_families cf
                 JOIN family_members fm ON fm.family_id=cf.id
                GROUP BY cf.id ORDER BY cf.id""",
        )
        media = rows(
            connection,
            "SELECT sha256, media_type, byte_size FROM media_objects ORDER BY sha256",
        )
        run = connection.execute(
            "SELECT id,status,started_at,completed_at FROM nightly_runs WHERE id=?", (run_id,)
        ).fetchone()
        schema_version = connection.execute("PRAGMA user_version").fetchone()[0]
    finally:
        connection.close()
    database = core.database_path(root)
    return {
        "contract": "negroni-meta-engine-fixture-result",
        "contract_version": "1.0",
        "run_id": run_id,
        "status": str(run["status"]) if run else "failed",
        "started_at": str(run["started_at"]) if run else None,
        "completed_at": str(run["completed_at"]) if run else None,
        "idempotent": idempotent,
        "schema_version": schema_version,
        "database_sha256": sha256_file(database),
        "counts": counts,
        "ads": ads,
        "families": families,
        "media": media,
    }


def record_eligible_absences(core: Any, root: Path, run_id: str, observed_at: str) -> None:
    """Complete exact-page scans retain explicit append-only absence evidence."""
    connection = core.connect(root)
    try:
        watch_run = connection.execute(
            """SELECT id,watch_id,browser_timestamp FROM watch_runs
                 WHERE nightly_run_id=? AND coverage_complete=1
                 ORDER BY id DESC LIMIT 1""",
            (run_id,),
        ).fetchone()
        if not watch_run:
            return
        missing = connection.execute(
            """SELECT wa.library_id FROM watch_ads wa
                 WHERE wa.watch_id=?
                   AND NOT EXISTS (
                     SELECT 1 FROM ad_observations o
                      WHERE o.watch_run_id=? AND o.library_id=wa.library_id
                   )
                 ORDER BY wa.library_id""",
            (watch_run["watch_id"], watch_run["id"]),
        ).fetchall()
        for row in missing:
            payload_hash = hashlib.sha256(
                f"eligible-absence\x1f{run_id}\x1f{row['library_id']}".encode("utf-8")
            ).hexdigest()
            connection.execute(
                """INSERT OR IGNORE INTO ad_observations(
                       watch_run_id,library_id,observed_at,is_present,raw_start_date,
                       browser_timestamp,observation_source,payload_hash
                   ) VALUES (?,?,?,0,'',?,'eligible_absence',?)""",
                (watch_run["id"], row["library_id"], observed_at, watch_run["browser_timestamp"], payload_hash),
            )
        connection.commit()
    finally:
        connection.close()


def main() -> int:
    args = parse_args()
    engine_root = Path(args.engine_root).expanduser().resolve()
    profile_root = Path(args.profile_root).expanduser().resolve()
    payload_path = Path(args.payload).expanduser().resolve()
    if not (engine_root / "mai_core.py").is_file():
        raise ValueError("Meta Ads Intelligence engine is unavailable")
    if not payload_path.is_file():
        raise ValueError("fixture payload is unavailable")
    sys.path.insert(0, str(engine_root))
    core = importlib.import_module("mai_core")
    core.utc_now = lambda: args.observed_at
    core.initialize_profile(profile_root, profile=args.profile)
    if not any(item.get("id") == args.watch_id for item in core.watch_definitions(profile_root)):
        core.add_watch(profile_root, watch_id=args.watch_id, page_id=args.page_id, notes="Sanitized Negroni fixture")

    connection = core.connect(profile_root)
    try:
        existing = connection.execute("SELECT status FROM nightly_runs WHERE id=?", (args.run_id,)).fetchone()
    finally:
        connection.close()
    idempotent = existing is not None
    if not idempotent:
        payload, fixture_media = load_fixture(payload_path)

        def fixture_downloader(url: str, destination_stem: Path, media_type: str):
            content = fixture_media.get(url)
            if content is None:
                raise ValueError("fixture downloader received an unregistered URL")
            return write_fixture_media(destination_stem, content, media_type)

        core.ingest(
            payload,
            args.watch_id,
            profile_root,
            download=True,
            nightly_run_id=args.run_id,
            downloader=fixture_downloader,
            trusted_completeness=True,
        )
        record_eligible_absences(core, profile_root, args.run_id, args.observed_at)
        core.rebuild_families(profile_root)
    result = inspect_engine(core, profile_root, args.run_id, idempotent)
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write(f"competitor fixture engine failed: {type(error).__name__}: {error}\n")
        raise SystemExit(5)
