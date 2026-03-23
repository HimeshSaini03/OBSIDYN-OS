"""Configuration management."""
import json
import os
from utils.file_utils import FileUtils
from utils.logger import log_exception


class ConfigManager:
    """Manages application configuration."""

    DEFAULT_CONFIG = {
        "privacy_mode": True,
        "store_full_paths": False,
        "log_level": "ERROR",
        "auto_lock_minutes": 10,
        "default_security_profile": "PERSONAL",
        "visual_recovery_enabled": True,
        "login_binary_enabled": True,
        "reduced_motion": False,
    }

    def __init__(self):
        self.config_path = self._get_config_path()
        self.config = self._load_config()

    def _get_config_path(self):
        """Get path to config file."""
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "app_config.json")

    def _load_config(self):
        """Load configuration from file."""
        config = dict(self.DEFAULT_CONFIG)

        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as file_handle:
                    loaded = json.load(file_handle)
                    if isinstance(loaded, dict):
                        config.update(loaded)
        except Exception as exc:
            log_exception(f"[CONFIG] Error loading config: {exc}", exc)

        return config

    def save_config(self):
        """Save configuration to file."""
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            FileUtils.write_json(self.config_path, self.config)
        except Exception as exc:
            log_exception(f"[CONFIG] Error saving config: {exc}", exc)

    def get(self, key, default=None):
        """Get configuration value."""
        return self.config.get(key, default)

    def set(self, key, value):
        """Set configuration value."""
        self.config[key] = value
        self.save_config()
