"""Decoy vault and honeyfile management."""
import hashlib
import os
import random
import secrets
from datetime import datetime

from utils.file_utils import FileUtils
from utils.logger import log_exception, mask_path


class DecoyManager:
    """Creates and tracks decoy vaults plus honeyfiles."""

    BAIT_LIBRARY = {
        "finance": [
            ("Quarterly_Reconciliation.csv", "ledger_id,amount,status\nA-1409,12440.90,PENDING\nB-3920,810.00,HOLD\n"),
            ("Board_Remittance_Notes.txt", "Settlement references held for approval.\nEscalate only through secure channel.\n"),
            ("Vendor_Payout_Map.md", "# Vendor Payout Map\n- Corridor-1: Manual release\n- Corridor-2: Review pending\n"),
        ],
        "research": [
            ("Prototype_Transfer_Log.txt", "Transfer corridor reopened at 04:30 UTC.\nChecksum review still pending.\n"),
            ("Field_Study_Index.csv", "sample_id,zone,priority\nR-19,North,High\nR-21,East,Critical\n"),
            ("Acquisition_Notes.md", "# Acquisition Notes\nObservation lattice requires second pass.\n"),
        ],
        "operations": [
            ("Ops_Rotation_Grid.csv", "unit,window,location\nEcho,21:00,Delta\nKilo,03:00,North\n"),
            ("Transit_Access_Brief.txt", "Transit corridors remain compartmentalized.\nPhysical keys rotated on weekday cycle.\n"),
            ("Containment_Checklist.md", "# Containment Checklist\n- Stage decoy media\n- Verify watchlist\n"),
        ],
    }

    def __init__(self):
        self.registry_path = self._get_registry_path()
        self.registry = self._load_registry()

    def _get_registry_path(self):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        decoy_dir = os.path.join(project_root, "data", "decoys")
        os.makedirs(decoy_dir, exist_ok=True)
        return os.path.join(decoy_dir, "registry.json")

    def _load_registry(self):
        if not os.path.exists(self.registry_path):
            return {"vaults": [], "events": []}

        try:
            import json

            with open(self.registry_path, "r", encoding="utf-8") as file_handle:
                loaded = json.load(file_handle)
                if isinstance(loaded, dict):
                    loaded.setdefault("vaults", [])
                    loaded.setdefault("events", [])
                    return loaded
        except Exception as exc:
            log_exception(f"[DECOY] Error loading registry: {exc}", exc)

        return {"vaults": [], "events": []}

    def _save_registry(self):
        FileUtils.write_json(self.registry_path, self.registry)

    def create_decoy_vault(self, target_dir=None, profile="operations", file_count=3):
        target_root = target_dir or os.path.dirname(self.registry_path)
        os.makedirs(target_root, exist_ok=True)

        vault_id = secrets.token_hex(5)
        folder_name = f"Ops_Archive_{vault_id.upper()}"
        vault_path = os.path.join(target_root, folder_name)
        os.makedirs(vault_path, exist_ok=True)

        bait_pool = list(self.BAIT_LIBRARY.get(profile, self.BAIT_LIBRARY["operations"]))
        random.shuffle(bait_pool)
        selected = bait_pool[: max(1, min(file_count, len(bait_pool)))]

        records = []
        for file_name, content in selected:
            file_path = os.path.join(vault_path, file_name)
            tagged_content = (
                f"{content}\n# honey_id={vault_id}\n# token={secrets.token_hex(8)}\n"
            )
            FileUtils.write_file(file_path, tagged_content.encode("utf-8"))
            records.append(self._snapshot_file(file_path))

        vault_record = {
            "id": vault_id,
            "profile": profile,
            "label": folder_name,
            "path": vault_path,
            "created_at": datetime.utcnow().isoformat(timespec="seconds"),
            "files": records,
            "alerts": [],
        }
        self.registry["vaults"].append(vault_record)
        self._append_event("DECOY_CREATED", f"Decoy vault seeded at {mask_path(vault_path)}")
        self._save_registry()
        return {
            "status": "SUCCESS",
            "data": f"Decoy vault created: {folder_name}",
            "vault": self._sanitize_vault(vault_record),
        }

    def get_status(self):
        alerts = self.poll_alerts()
        return {
            "status": "OK",
            "data": {
                "vaults": [self._sanitize_vault(vault) for vault in self.registry["vaults"]],
                "alerts": alerts,
                "event_count": len(self.registry["events"]),
            },
        }

    def poll_alerts(self):
        alerts = []
        for vault in self.registry["vaults"]:
            for index, file_record in enumerate(vault.get("files", [])):
                current_path = file_record.get("path")
                if not current_path:
                    continue

                if not os.path.exists(current_path):
                    alert = self._make_alert(
                        vault,
                        current_path,
                        "FILE_REMOVED",
                        "Honeyfile was removed from the decoy vault",
                    )
                    alerts.append(alert)
                    continue

                current = self._snapshot_file(current_path)
                if current["sha256"] != file_record.get("sha256"):
                    alerts.append(
                        self._make_alert(
                            vault,
                            current_path,
                            "FILE_MODIFIED",
                            "Honeyfile content changed inside decoy vault",
                        )
                    )
                    vault["files"][index] = current
                elif current.get("last_accessed") != file_record.get("last_accessed"):
                    alerts.append(
                        self._make_alert(
                            vault,
                            current_path,
                            "FILE_TOUCHED",
                            "Honeyfile access timestamp advanced",
                        )
                    )
                    vault["files"][index] = current

        if alerts:
            for alert in alerts:
                self.registry["events"].append(alert)
            self.registry["events"] = self.registry["events"][-100:]
            self._save_registry()

        return self.registry["events"][-20:]

    def _make_alert(self, vault, file_path, kind, message):
        alert = {
            "kind": kind,
            "message": message,
            "vault": vault.get("label"),
            "file": mask_path(file_path),
            "timestamp": datetime.utcnow().isoformat(timespec="seconds"),
        }
        vault.setdefault("alerts", []).append(alert)
        vault["alerts"] = vault["alerts"][-20:]
        return alert

    def _append_event(self, kind, message):
        self.registry["events"].append(
            {
                "kind": kind,
                "message": message,
                "timestamp": datetime.utcnow().isoformat(timespec="seconds"),
            }
        )
        self.registry["events"] = self.registry["events"][-100:]

    def _sanitize_vault(self, vault):
        return {
            "id": vault.get("id"),
            "profile": vault.get("profile"),
            "label": vault.get("label"),
            "path": mask_path(vault.get("path", "")),
            "created_at": vault.get("created_at"),
            "file_count": len(vault.get("files", [])),
            "alerts": vault.get("alerts", [])[-5:],
            "files": [
                {
                    "name": mask_path(file_record.get("path", "")),
                    "size": file_record.get("size", 0),
                    "last_accessed": file_record.get("last_accessed"),
                }
                for file_record in vault.get("files", [])
            ],
        }

    def _snapshot_file(self, file_path):
        payload = FileUtils.read_file(file_path)
        stat = os.stat(file_path)
        return {
            "path": file_path,
            "size": stat.st_size,
            "last_modified": stat.st_mtime_ns,
            "last_accessed": stat.st_atime_ns,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
