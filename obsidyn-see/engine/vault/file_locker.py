"""File locking logic"""
import sys
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.hash_utils import HashUtils
from utils.file_utils import FileUtils
from security.file_hider import FileHider
from security.secure_deleter import SecureDeleter

class FileLocker:
    """Handles file locking operations"""
    
    def __init__(self, session_key, vault_index):
        self.session_key = session_key
        self.index = vault_index
        self.hider = FileHider()
        self.deleter = SecureDeleter()
        
    def lock(self, file_path):
        """
        Lock a single file
        Args:
            file_path (str): Path to file to lock
        Returns:
            dict: Result with status and data
        """
        try:
            # Validate file
            if not os.path.exists(file_path):
                return {"status": "ERROR", "data": "File not found"}
            
            if not os.path.isfile(file_path):
                return {"status": "ERROR", "data": "Path is not a file"}
            
            # Get file info
            file_size = os.path.getsize(file_path)
            file_hash = HashUtils.calculate_sha256(file_path)
            original_name = os.path.basename(file_path)
            original_path = os.path.abspath(file_path)
            
            # Read file
            data = FileUtils.read_file(file_path)
            
            # Encrypt
            aesgcm = AESGCM(self.session_key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, data, None)
            
            # Generate container name
            container_name = self.index.generate_container_name(original_name)
            container_path = self.index.get_vault_path(container_name)
            
            # Write container
            with open(container_path, 'wb') as f:
                f.write(nonce + ciphertext)
            
            container_size = os.path.getsize(container_path)
            
            # Hide container
            self.hider.hide(container_path)
            
            # Delete original
            self.deleter.secure_delete(file_path)
            
            # Add to index
            metadata = {
                "container_name": container_name,
                "original_name": original_name,
                "original_path": original_path,
                "original_size": file_size,
                "original_hash": file_hash,
                "container_size": container_size,
                "locked_at": FileUtils.get_timestamp(),
                "type": "file"
            }
            
            self.index.add_item(container_name, original_path, "file", metadata)
            
            return {
                "status": "SUCCESS",
                "data": f"Locked: {original_name}",
                "metadata": metadata
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Lock failed: {str(e)}"}