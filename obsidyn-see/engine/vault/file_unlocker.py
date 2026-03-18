"""File unlocking logic"""
import sys
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.file_utils import FileUtils
from security.file_hider import FileHider

class FileUnlocker:
    """Handles file unlocking operations"""
    
    def __init__(self, session_key, vault_index):
        self.session_key = session_key
        self.index = vault_index
        self.hider = FileHider()
        
    def unlock(self, container_name, restore_path):
        """
        Unlock a file
        Args:
            container_name (str): Name of container file
            restore_path (str): Path to restore file to
        Returns:
            dict: Result with status and data
        """
        try:
            # Find container
            container_info = self.index.get_item(container_name)
            if not container_info:
                return {"status": "ERROR", "data": "Container not found"}
            
            container_path = self.index.get_vault_path(container_name)
            if not os.path.exists(container_path):
                return {"status": "ERROR", "data": "Container file not found"}
            
            # Get metadata
            metadata = self.index.get_metadata(container_name)
            
            # Unhide container
            self.hider.unhide(container_path)
            
            # Read container
            with open(container_path, 'rb') as f:
                data = f.read()
            
            # Decrypt
            nonce = data[:12]
            ciphertext = data[12:]
            aesgcm = AESGCM(self.session_key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            
            # Write file
            with open(restore_path, 'wb') as f:
                f.write(plaintext)
            
            # Remove container
            os.remove(container_path)
            
            # Remove from index
            self.index.remove_item(container_name)
            
            original_name = metadata.get('original_name', 'restored_file')
            
            return {
                "status": "SUCCESS",
                "data": f"Unlocked: {original_name}",
                "restore_path": restore_path
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Unlock failed: {str(e)}"}