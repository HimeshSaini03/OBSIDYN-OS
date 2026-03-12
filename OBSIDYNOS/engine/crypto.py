import argon2
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64
import json
import sys  

class CryptoEngine:
    def __init__(self):
        self.ph = argon2.PasswordHasher(
            time_cost=3, 
            memory_cost=65536, 
            parallelism=4, 
            hash_len=32, 
            type=argon2.Type.ID
        )
        
        # Get path relative to this file
        engine_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(engine_dir)
        self.salt_path = os.path.join(project_root, "config", "security_policy.json")
        
        # Load or create salt IMMEDIATELY
        self.salt = self._get_or_create_salt()
        sys.stderr.write(f"[CRYPTO] Salt loaded: {self.salt[:20]}...\n")
        sys.stderr.flush()

    def _get_or_create_salt(self):
        """Get existing salt or create new one"""
        try:
            if os.path.exists(self.salt_path):
                with open(self.salt_path, 'r') as f:
                    data = json.load(f)
                    salt = data.get('salt')
                    if salt:
                        sys.stderr.write(f"[CRYPTO] Loaded existing salt\n")
                        sys.stderr.flush()
                        return salt
        except Exception as e:
            sys.stderr.write(f"[CRYPTO] Error loading salt: {e}\n")
            sys.stderr.flush()
        
        # Create new salt
        salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        self._save_salt(salt)
        sys.stderr.write(f"[CRYPTO] Created new salt\n")
        sys.stderr.flush()
        return salt

    def _save_salt(self, salt):
        """Save salt to config file"""
        try:
            os.makedirs(os.path.dirname(self.salt_path), exist_ok=True)
            with open(self.salt_path, 'w') as f:
                json.dump({'salt': salt}, f, indent=2)
            sys.stderr.write(f"[CRYPTO] Salt saved to {self.salt_path}\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[CRYPTO] Error saving salt: {e}\n")
            sys.stderr.flush()

    def derive_key(self, password, salt=None):
        """Derives a 32-byte key using Argon2id"""
        try:
            # Use provided salt or default to stored salt
            if salt is None:
                salt = self.salt
            
            hash_str = self.ph.hash(password + salt)
            key = hash_str.encode()[:32]
            sys.stderr.write(f"[CRYPTO] Key derived successfully\n")
            sys.stderr.flush()
            return key
        except Exception as e:
            sys.stderr.write(f"[CRYPTO] Key derivation failed: {e}\n")
            sys.stderr.flush()
            raise Exception(f"Key derivation failed: {str(e)}")

    def get_salt(self):
        """Return the stored salt"""
        return self.salt

    def encrypt(self, key, plaintext):
        """AES-GCM Encryption"""
        try:
            aesgcm = AESGCM(key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
            combined = nonce + ciphertext
            return base64.b64encode(combined).decode('utf-8')
        except Exception as e:
            raise Exception(f"Encryption failed: {str(e)}")

    def decrypt(self, key, ciphertext_b64):
        """AES-GCM Decryption"""
        try:
            aesgcm = AESGCM(key)
            data = base64.b64decode(ciphertext_b64)
            nonce = data[:12]
            ciphertext = data[12:]
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode('utf-8')
        except Exception as e:
            raise Exception(f"Decryption failed: {str(e)}")