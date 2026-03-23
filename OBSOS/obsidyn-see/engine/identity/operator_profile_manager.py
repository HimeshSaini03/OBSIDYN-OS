"""Encrypted operator dossier and notes storage."""
import json
import os

from crypto.cipher import Cipher
from utils.file_utils import FileUtils
from utils.logger import log_exception


class OperatorProfileManager:
    """Stores operator profile data encrypted under the session key."""

    DEFAULT_PROFILE = {
        "call_sign": "",
        "full_name": "",
        "organization": "",
        "designation": "",
        "email": "",
        "phone": "",
        "location": "",
        "mission_notes": "",
        "private_notes": "",
        "recovery_phrase_hint": "",
        "updated_at": None,
    }

    def __init__(self):
        self.profile_path = self._get_profile_path()

    def _get_profile_path(self):
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "operator_profile.json")

    def _default_payload(self):
        return {
            "version": 1,
            "ciphertext": None,
            "updated_at": None,
        }

    def _read_payload(self):
        if not os.path.exists(self.profile_path):
            return self._default_payload()

        try:
            with open(self.profile_path, "r", encoding="utf-8") as file_handle:
                loaded = json.load(file_handle)
                if isinstance(loaded, dict):
                    payload = self._default_payload()
                    payload.update(loaded)
                    return payload
        except Exception as exc:
            log_exception(f"[IDENTITY] Failed to read operator profile: {exc}", exc)

        return self._default_payload()

    def load_profile(self, session_key):
        """Load the operator profile, or return defaults when unset."""
        payload = self._read_payload()
        ciphertext = payload.get("ciphertext")
        if not ciphertext:
            return dict(self.DEFAULT_PROFILE)

        try:
            decrypted = Cipher.decrypt(session_key, ciphertext)
            parsed = json.loads(decrypted)
            if isinstance(parsed, dict):
                profile = dict(self.DEFAULT_PROFILE)
                profile.update(parsed)
                return profile
        except Exception as exc:
            log_exception(f"[IDENTITY] Failed to decrypt operator profile: {exc}", exc)
            raise ValueError("Unable to decrypt operator profile") from exc

        return dict(self.DEFAULT_PROFILE)

    def save_profile(self, session_key, profile_patch):
        """Persist operator profile fields securely."""
        current = self.load_profile(session_key)
        for key, default_value in self.DEFAULT_PROFILE.items():
            if key in profile_patch:
                value = profile_patch.get(key)
                current[key] = value if isinstance(default_value, str) else value

        current["updated_at"] = FileUtils.get_timestamp()
        encrypted = Cipher.encrypt(session_key, json.dumps(current))
        FileUtils.write_json(
            self.profile_path,
            {
                "version": 1,
                "ciphertext": encrypted,
                "updated_at": current["updated_at"],
            },
        )
        return current

    def rotate_key(self, old_key, new_key):
        """Re-encrypt profile data under a new session key."""
        payload = self._read_payload()
        if not payload.get("ciphertext"):
            return

        profile = self.load_profile(old_key)
        encrypted = Cipher.encrypt(new_key, json.dumps(profile))
        FileUtils.write_json(
            self.profile_path,
            {
                "version": payload.get("version", 1),
                "ciphertext": encrypted,
                "updated_at": profile.get("updated_at"),
            },
        )
