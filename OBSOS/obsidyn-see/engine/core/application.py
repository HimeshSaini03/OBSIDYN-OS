"""Main application orchestration."""
from .session import Session
from auth.authenticator import Authenticator
from config.config_manager import ConfigManager
from decoy.decoy_manager import DecoyManager
from identity.operator_profile_manager import OperatorProfileManager
from monitoring.system_monitor import SystemMonitor
from utils.logger import log
from vault.vault_manager import VaultManager


class Application:
    """Main application class."""

    def __init__(self):
        self.session = Session()
        self.config = ConfigManager()
        self.authenticator = None
        self.vault_manager = None
        self.decoy_manager = None
        self.system_monitor = None
        self.operator_profile = None

    def initialize(self):
        """Initialize application components."""
        self.authenticator = Authenticator()
        self.decoy_manager = DecoyManager()
        self.system_monitor = SystemMonitor(self.decoy_manager)
        self.operator_profile = OperatorProfileManager()
        log("[APP] Application initialized", level="DEBUG")

    def authenticate(self, password_hash, keystroke_sample=None, recovery_payload=None):
        """Authenticate user."""
        if not self.authenticator:
            return False, "Authenticator not initialized", {}

        if not self.config.get("visual_recovery_enabled", True):
            recovery_payload = None
        success, message, behavioral = self.authenticator.authenticate(
            password_hash, keystroke_sample, recovery_payload
        )
        behavioral = self._decorate_behavioral_status(behavioral)
        if success:
            session_key = self.authenticator.get_session_key()
            self.session.set_authenticated(True)
            self.session.set_session_key(session_key)
            self.vault_manager = VaultManager(session_key)
            return True, message, behavioral

        return False, message, behavioral

    def authenticate_visual_recovery(self, recovery_payload=None):
        """Authenticate using visual recovery without a password."""
        if not self.authenticator:
            return False, "Authenticator not initialized", {}

        if not self.config.get("visual_recovery_enabled", True):
            return False, "Visual recovery is disabled in settings", self._decorate_behavioral_status(
                self.authenticator.get_behavioral_status()
            )
        success, message, behavioral = self.authenticator.authenticate_visual_recovery(
            recovery_payload or {}
        )
        behavioral = self._decorate_behavioral_status(behavioral)
        if success:
            session_key = self.authenticator.get_session_key()
            self.session.set_authenticated(True)
            self.session.set_session_key(session_key)
            self.vault_manager = VaultManager(session_key)
            return True, message, behavioral

        return False, message, behavioral

    def logout(self):
        """Logout user."""
        if self.system_monitor:
            self.system_monitor.stop()
        if self.authenticator:
            self.authenticator.logout()
        self.session.reset()
        self.vault_manager = None
        log("[APP] User logged out", level="DEBUG")

    def is_authenticated(self):
        """Check if user is authenticated."""
        return self.session.is_authenticated()

    def get_vault_manager(self):
        """Get vault manager instance."""
        return self.vault_manager

    def get_auth_status(self):
        """Get behavioral authentication status."""
        if not self.authenticator:
            return {"configured": False}
        return self._decorate_behavioral_status(self.authenticator.get_behavioral_status())

    def get_operator_profile(self):
        """Load the encrypted operator dossier."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        profile = self.operator_profile.load_profile(self.session.get_session_key())
        return {"status": "OK", "data": profile}

    def save_operator_profile(self, profile_patch):
        """Save operator profile fields."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        profile = self.operator_profile.save_profile(
            self.session.get_session_key(),
            profile_patch or {},
        )
        return {"status": "SUCCESS", "data": "Operator dossier updated", "profile": profile}

    def get_app_settings(self):
        """Get operator-controlled runtime settings."""
        return {
            "status": "OK",
            "data": {
                "auto_lock_minutes": self.config.get("auto_lock_minutes", 10),
                "default_security_profile": self.config.get("default_security_profile", "PERSONAL"),
                "privacy_mode": self.config.get("privacy_mode", True),
                "store_full_paths": self.config.get("store_full_paths", False),
                "visual_recovery_enabled": self.config.get("visual_recovery_enabled", True),
                "login_binary_enabled": self.config.get("login_binary_enabled", True),
                "reduced_motion": self.config.get("reduced_motion", False),
            },
        }

    def update_app_settings(self, settings):
        """Persist runtime settings."""
        settings = settings or {}
        if "auto_lock_minutes" in settings:
            self.config.set("auto_lock_minutes", max(1, min(int(settings["auto_lock_minutes"]), 60)))
        if "default_security_profile" in settings:
            self.config.set("default_security_profile", str(settings["default_security_profile"]).upper())
        if "privacy_mode" in settings:
            self.config.set("privacy_mode", bool(settings["privacy_mode"]))
        if "store_full_paths" in settings:
            self.config.set("store_full_paths", bool(settings["store_full_paths"]))
        if "visual_recovery_enabled" in settings:
            self.config.set("visual_recovery_enabled", bool(settings["visual_recovery_enabled"]))
        if "login_binary_enabled" in settings:
            self.config.set("login_binary_enabled", bool(settings["login_binary_enabled"]))
        if "reduced_motion" in settings:
            self.config.set("reduced_motion", bool(settings["reduced_motion"]))
        return self.get_app_settings()

    def update_rhythm_policy(self, minimum_training_samples=None, threshold=None):
        """Update behavioral authentication policy."""
        if not self.authenticator:
            return {"status": "ERROR", "data": "Authenticator not initialized"}
        return {
            "status": "SUCCESS",
            "data": "Rhythm Lock policy updated",
            "policy": self._decorate_behavioral_status(
                self.authenticator.update_rhythm_policy(
                    minimum_training_samples,
                    threshold,
                )
            ),
        }

    def enroll_visual_recovery(self, face_image, gesture_image, gesture_label):
        """Enroll the visual recovery fallback."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        status = self.authenticator.enroll_visual_recovery(face_image, gesture_image, gesture_label)
        status["enabled"] = self.config.get("visual_recovery_enabled", True)
        return {"status": "SUCCESS", "data": "Visual recovery enrolled", "recovery": status}

    def delete_visual_recovery(self):
        """Delete the visual recovery enrollment."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}
        status = self.authenticator.delete_visual_recovery()
        status["enabled"] = self.config.get("visual_recovery_enabled", True)
        return {"status": "SUCCESS", "data": "Visual recovery enrollment deleted", "recovery": status}

    def rotate_master_key(self, current_password_hash, new_password_hash):
        """Rotate the master password and re-encrypt dependent stores."""
        if not self.is_authenticated():
            return {"status": "ERROR", "data": "Not authenticated"}

        success, result = self.authenticator.rotate_master_key(
            current_password_hash,
            new_password_hash,
        )
        if not success:
            return {"status": "ERROR", "data": result.get("message", "Master key rotation failed")}

        old_key = result["old_key"]
        new_key = result["new_key"]
        if self.vault_manager:
            self.vault_manager.rotate_session_key(old_key, new_key)
            self.vault_manager = VaultManager(new_key)
        self.operator_profile.rotate_key(old_key, new_key)
        self.session.set_session_key(new_key)
        return {
            "status": "SUCCESS",
            "data": result.get("message", "Master key rotated"),
            "auth_status": self._decorate_behavioral_status(result.get("status")),
        }

    def _decorate_behavioral_status(self, status):
        if not isinstance(status, dict):
            return status

        visual_recovery = status.get("visual_recovery")
        if not isinstance(visual_recovery, dict):
            visual_recovery = {}
        visual_recovery["enabled"] = self.config.get("visual_recovery_enabled", True)
        status["visual_recovery"] = visual_recovery
        status["visual_recovery_allowed"] = (
            bool(visual_recovery.get("configured")) and bool(visual_recovery.get("enabled"))
        )
        return status

    def create_decoy_vault(self, target_dir=None, profile="operations", file_count=3):
        """Create a decoy vault plus honeyfiles."""
        return self.decoy_manager.create_decoy_vault(target_dir, profile, file_count)

    def get_decoy_status(self):
        """Get decoy vault and honeyfile status."""
        return self.decoy_manager.get_status()

    def start_monitoring(self):
        """Enable process and honeyfile monitoring."""
        return self.system_monitor.start()

    def stop_monitoring(self):
        """Disable process and honeyfile monitoring."""
        return self.system_monitor.stop()

    def get_monitor_status(self):
        """Get process and honeyfile monitoring status."""
        return self.system_monitor.get_status()
