"""Authentication logic"""
import sys
from .password_hasher import PasswordHasher
from crypto.key_derivation import KeyDerivation
from core.session import Session

class Authenticator:
    """Handles user authentication"""
    
    def __init__(self):
        self.password_hasher = PasswordHasher()
        self.key_derivation = KeyDerivation()
        self.session = Session()
        self.session_key = None
        
    def authenticate(self, password_hash):
        """Authenticate user with password hash"""
        try:
            self.session_key = self.key_derivation.derive_key(password_hash)
            
            if self.session_key:
                self.session.set_session_key(self.session_key)
                sys.stderr.write("[AUTH] Authentication successful\n")
                sys.stderr.flush()
                return True, ""
            else:
                sys.stderr.write("[AUTH] Authentication failed\n")
                sys.stderr.flush()
                return False, "Key derivation failed"
                
        except Exception as e:
            error_msg = f"Authentication error: {str(e)}"
            sys.stderr.write(f"[AUTH] {error_msg}\n")
            sys.stderr.flush()
            return False, error_msg
    
    def get_session_key(self):
        """Get derived session key"""
        return self.session_key
    
    def logout(self):
        """Clear authentication"""
        self.session_key = None
        self.session.reset()