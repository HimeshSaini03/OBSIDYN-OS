import os
import json
import sys
from datetime import datetime
from utils import MemoryProtector

class SecurityCore:
    def __init__(self):
        self.status = "IDLE"
        self.initialized = False
        self.session_key = None
        self.vault = None
        self.config_path = "../config/default.json"
        self.mem = MemoryProtector()
    
    def reset(self):
        """Reset core state for re-login"""
        self.status = "IDLE"
        self.initialized = False
        self.session_key = None
        self.vault = None
        sys.stderr.write("[ENGINE] Core reset\n")
        sys.stderr.flush()
    
    def initialize(self, session_key):
        """Initialize with new session key"""
        self.status = "ACTIVE"
        self.initialized = True
        self.session_key = session_key
        try:
            from vault import VaultEngine
            self.vault = VaultEngine(session_key)
            sys.stderr.write("[ENGINE] Vault initialized\n")
        except Exception as e:
            sys.stderr.write(f"[ENGINE] Vault init failed: {str(e)}\n")
            self.vault = None
        self.load_config()
        sys.stderr.flush()
        
    def load_config(self):
        """Load configuration file"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                sys.stderr.write(f"[ENGINE] Config loaded: {self.config_path}\n")
        except Exception as e:
            sys.stderr.write(f"[ENGINE] Config load failed: {str(e)}\n")
        sys.stderr.flush()
        
    def get_status(self):
        """Get current system status"""
        vault_count = 0
        if self.vault:
            try:
                result = self.vault.get_vault_list()
                if result.get("status") == "OK":
                    vault_count = len(result.get("data", []))
            except:
                pass
        
        return {
            "status": self.status,
            "initialized": self.initialized,
            "timestamp": datetime.now().isoformat(),
            "security_level": "PHASE_2_VAULT_ACTIVE",   
            "vault_items": vault_count
        }