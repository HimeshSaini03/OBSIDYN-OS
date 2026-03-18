"""Folder locking logic"""
import sys
import os
import zipfile
import hashlib
from datetime import datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.file_utils import FileUtils
from security.file_hider import FileHider
import shutil

class FolderLocker:
    """Handles folder locking operations"""
    
    def __init__(self, session_key, vault_index):
        self.session_key = session_key
        self.index = vault_index
        self.hider = FileHider()
        
    def lock(self, folder_path):
        """
        Lock entire folder
        Args:
            folder_path (str): Path to folder to lock
        Returns:
            dict: Result with status and data
        """
        try:
            if not os.path.exists(folder_path):
                return {"status": "ERROR", "data": "Folder not found"}
            
            if not os.path.isdir(folder_path):
                return {"status": "ERROR", "data": "Path is not a folder"}
            
            original_name = os.path.basename(folder_path.rstrip('/\\'))
            original_path = os.path.abspath(folder_path)
            
            # Count files and size
            total_files, total_size = FileUtils.count_folder_contents(folder_path)
            
            # Create temp zip
            temp_zip = os.path.join(
                self.index.get_vault_path(),
                f"temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            )
            
            # Create zip archive
            with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(folder_path))
                        zipf.write(file_path, arcname)
            
            # Read zip
            with open(temp_zip, 'rb') as f:
                data = f.read()
            
            zip_hash = hashlib.sha256(data).hexdigest()
            
            # Encrypt
            aesgcm = AESGCM(self.session_key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, data, None)
            
            # Generate container name
            container_name = self.index.generate_container_name(f"{original_name}_FOLDER")
            container_path = self.index.get_vault_path(container_name)
            
            # Write container
            with open(container_path, 'wb') as f:
                f.write(nonce + ciphertext)
            
            container_size = os.path.getsize(container_path)
            
            # Hide container
            self.hider.hide(container_path)
            
            # Remove temp zip
            os.remove(temp_zip)
            
            # Remove original folder
            shutil.rmtree(folder_path)
            
            # Add to index
            metadata = {
                "container_name": container_name,
                "original_name": original_name,
                "original_path": original_path,
                "original_size": total_size,
                "original_hash": zip_hash,
                "container_size": container_size,
                "locked_at": FileUtils.get_timestamp(),
                "type": "folder",
                "file_count": total_files
            }
            
            self.index.add_item(container_name, original_path, "folder", metadata)
            
            return {
                "status": "SUCCESS",
                "data": f"Locked folder: {original_name} ({total_files} files)",
                "metadata": metadata
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Folder lock failed: {str(e)}"}