"""Key derivation using Argon2id"""
import sys
import argon2
from .salt_manager import SaltManager

class KeyDerivation:
    """Derives encryption keys from passwords"""
    
    def __init__(self):
        self.ph = argon2.PasswordHasher(
            time_cost=3,
            memory_cost=65536,
            parallelism=4,
            hash_len=32,
            type=argon2.Type.ID
        )
        self.salt_manager = SaltManager()
        
    def derive_key(self, password_hash):
        """Derive 32-byte key from password hash"""
        try:
            salt = self.salt_manager.get_salt()
            hash_str = self.ph.hash(password_hash + salt)
            key = hash_str.encode()[:32]
            sys.stderr.write("[KEY_DERIVATION] Key derived successfully\n")
            sys.stderr.flush()
            return key
        except Exception as e:
            sys.stderr.write(f"[KEY_DERIVATION] Key derivation failed: {str(e)}\n")
            sys.stderr.flush()
            raise