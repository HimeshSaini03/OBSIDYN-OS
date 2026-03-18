"""Salt management for key derivation"""
import sys
import os
import json
import base64

class SaltManager:
    """Manages cryptographic salt"""
    
    def __init__(self):
        self.salt_path = self._get_salt_path()
        self.salt = self._load_or_create_salt()
        
    def _get_salt_path(self):
        """Get path to salt file"""
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "config", "security_policy.json")
    
    def _load_or_create_salt(self):
        """Load existing salt or create new one"""
        try:
            if os.path.exists(self.salt_path):
                with open(self.salt_path, 'r') as f:
                    data = json.load(f)
                    salt = data.get('salt')
                    if salt:
                        sys.stderr.write("[SALT] Loaded existing salt\n")
                        sys.stderr.flush()
                        return salt
        except Exception as e:
            sys.stderr.write(f"[SALT] Error loading salt: {e}\n")
            sys.stderr.flush()
        
        salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        self._save_salt(salt)
        sys.stderr.write("[SALT] Created new salt\n")
        sys.stderr.flush()
        return salt
    
    def _save_salt(self, salt):
        """Save salt to file"""
        try:
            os.makedirs(os.path.dirname(self.salt_path), exist_ok=True)
            with open(self.salt_path, 'w') as f:
                json.dump({'salt': salt}, f, indent=2)
            sys.stderr.write(f"[SALT] Salt saved\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[SALT] Error saving salt: {e}\n")
            sys.stderr.flush()
    
    def get_salt(self):
        """Get current salt"""
        return self.salt