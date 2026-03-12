import json
import sys
from crypto import CryptoEngine

class SecureIPC:
    def __init__(self, core):
        self.crypto = CryptoEngine()
        self.session_key = None
        self.authenticated = False
        self.core = core

    def reset(self):
        """Reset authentication state"""
        self.session_key = None
        self.authenticated = False
        if self.core:
            self.core.reset()
        sys.stderr.write("[ENGINE] Session reset\n")
        sys.stderr.flush()

    def handshake(self, password_hash):
        """Establish session with password"""
        try:
            # Use the stored salt from crypto engine
            salt = self.crypto.get_salt()
            sys.stderr.write(f"[ENGINE] Using salt: {salt[:20]}...\n")
            sys.stderr.flush()
            
            self.session_key = self.crypto.derive_key(password_hash, salt)
            sys.stderr.write(f"[ENGINE] Session key derived: {self.session_key.hex()[:32]}...\n")
            sys.stderr.flush()
            
            if self.core:
                self.core.initialize(self.session_key)
            self.authenticated = True
            sys.stderr.write("[ENGINE] Handshake successful\n")
            sys.stderr.flush()
            return True
        except Exception as e:
            sys.stderr.write(f"[ENGINE] Handshake failed: {str(e)}\n")
            sys.stderr.flush()
            return False

    def send(self, data, force_unencrypted=False):
        """Send response as plain JSON"""
        try:
            response = json.dumps(data)
            sys.stdout.write(response + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stderr.write(f"[ENGINE] Send error: {str(e)}\n")
            sys.stderr.flush()