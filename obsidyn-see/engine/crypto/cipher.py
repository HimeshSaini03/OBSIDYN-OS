"""AES-256-GCM encryption/decryption"""
import sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64

class Cipher:
    """AES-256-GCM cipher operations"""
    
    @staticmethod
    def encrypt(key, plaintext):
        """Encrypt plaintext using AES-256-GCM"""
        try:
            aesgcm = AESGCM(key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
            combined = nonce + ciphertext
            return base64.b64encode(combined).decode('utf-8')
        except Exception as e:
            sys.stderr.write(f"[CIPHER] Encryption failed: {str(e)}\n")
            sys.stderr.flush()
            raise
    
    @staticmethod
    def decrypt(key, ciphertext_b64):
        """Decrypt ciphertext using AES-256-GCM"""
        try:
            aesgcm = AESGCM(key)
            data = base64.b64decode(ciphertext_b64)
            nonce = data[:12]
            ciphertext = data[12:]
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode('utf-8')
        except Exception as e:
            sys.stderr.write(f"[CIPHER] Decryption failed: {str(e)}\n")
            sys.stderr.flush()
            raise