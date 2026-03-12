import os
import json
import shutil
import zipfile
import hashlib
import ctypes
from datetime import datetime
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils import secure_delete_file
import sys 

class VaultEngine:
    def __init__(self, session_key):
        self.key = session_key
        
        # Get the directory where this file is located
        engine_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(engine_dir)
        
        # Set paths relative to project root
        self.vault_path = os.path.join(project_root, "data", "vaults")
        self.index_path = os.path.join(project_root, "data", "vault_index.json")
        self.metadata_path = os.path.join(project_root, "data", "vault_metadata.json")
        
        # Ensure directories exist
        os.makedirs(self.vault_path, exist_ok=True)
        
        # Load or initialize index
        self.vault_index = self._load_index()
        self.vault_metadata = self._load_metadata()
    
    def _load_index(self):
        """Load vault index from file"""
        try:
            with open(self.index_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
    
    def _load_metadata(self):
        """Load vault metadata from file"""
        try:
            with open(self.metadata_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
    
    def _save_index(self):
        """Save vault index to file"""
        with open(self.index_path, 'w') as f:
            json.dump(self.vault_index, f, indent=2)
    
    def _save_metadata(self):
        """Save vault metadata to file"""
        with open(self.metadata_path, 'w') as f:
            json.dump(self.vault_metadata, f, indent=2)
    
    def _generate_container_name(self, original_name):
        """Generate unique container name"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c for c in original_name if c.isalnum() or c in ('-', '_', '.')).rstrip()
        return f"{safe_name}.{timestamp}.aegis"
    
    def _calculate_file_hash(self, file_path):
        """Calculate SHA-256 hash of file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _hide_file_windows(self, file_path):
        """Hide file from Windows Explorer"""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x02 | 0x04)
            return True
        except Exception as e:
            print(f"Hide file failed: {e}")
            return False
    
    def _unhide_file_windows(self, file_path):
        """Remove hidden attributes from file"""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x80)
            return True
        except Exception as e:
            print(f"Unhide file failed: {e}")
            return False
    
    def lock_file(self, file_path):
        """Lock a single file"""
        try:
            if not os.path.exists(file_path):
                return {"status": "ERROR", "data": "File not found"}
            
            if not os.path.isfile(file_path):
                return {"status": "ERROR", "data": "Path is not a file"}
            
            file_size = os.path.getsize(file_path)
            file_hash = self._calculate_file_hash(file_path)
            original_name = os.path.basename(file_path)
            original_path = os.path.abspath(file_path)
            
            with open(file_path, 'rb') as f:
                data = f.read()
            
            aesgcm = AESGCM(self.key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, data, None)
            
            container_name = self._generate_container_name(original_name)
            container_path = os.path.join(self.vault_path, container_name)
            
            with open(container_path, 'wb') as f:
                f.write(nonce + ciphertext)
            
            container_size = os.path.getsize(container_path)
            self._hide_file_windows(container_path)
            secure_delete_file(file_path)
            
            metadata = {
                "container_name": container_name,
                "original_name": original_name,
                "original_path": original_path,
                "original_size": file_size,
                "original_hash": file_hash,
                "container_size": container_size,
                "locked_at": datetime.now().isoformat(),
                "type": "file"
            }
            
            self.vault_index.append({
                "container": container_name,
                "original": original_path,
                "type": "file"
            })
            
            self.vault_metadata[container_name] = metadata
            self._save_index()
            self._save_metadata()
            
            return {
                "status": "SUCCESS",
                "data": f"Locked: {original_name}",
                "metadata": metadata
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Lock failed: {str(e)}"}
    
    def lock_folder(self, folder_path):
        """Lock entire folder"""
        try:
            if not os.path.exists(folder_path):
                return {"status": "ERROR", "data": "Folder not found"}
            
            if not os.path.isdir(folder_path):
                return {"status": "ERROR", "data": "Path is not a folder"}
            
            original_name = os.path.basename(folder_path.rstrip('/\\'))
            original_path = os.path.abspath(folder_path)
            
            total_files = 0
            total_size = 0
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    total_files += 1
                    total_size += os.path.getsize(file_path)
            
            temp_zip = os.path.join(self.vault_path, f"temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip")
            
            with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(folder_path))
                        zipf.write(file_path, arcname)
            
            with open(temp_zip, 'rb') as f:
                data = f.read()
            
            zip_size = len(data)
            zip_hash = hashlib.sha256(data).hexdigest()
            
            aesgcm = AESGCM(self.key)
            nonce = os.urandom(12)
            ciphertext = aesgcm.encrypt(nonce, data, None)
            
            container_name = self._generate_container_name(f"{original_name}_FOLDER")
            container_path = os.path.join(self.vault_path, container_name)
            
            with open(container_path, 'wb') as f:
                f.write(nonce + ciphertext)
            
            container_size = os.path.getsize(container_path)
            self._hide_file_windows(container_path)
            os.remove(temp_zip)
            shutil.rmtree(folder_path)
            
            metadata = {
                "container_name": container_name,
                "original_name": original_name,
                "original_path": original_path,
                "original_size": total_size,
                "original_hash": zip_hash,
                "container_size": container_size,
                "locked_at": datetime.now().isoformat(),
                "type": "folder",
                "file_count": total_files
            }
            
            self.vault_index.append({
                "container": container_name,
                "original": original_path,
                "type": "folder"
            })
            
            self.vault_metadata[container_name] = metadata
            self._save_index()
            self._save_metadata()
            
            return {
                "status": "SUCCESS",
                "data": f"Locked folder: {original_name} ({total_files} files)",
                "metadata": metadata
            }
            
        except Exception as e:
            if 'temp_zip' in locals() and os.path.exists(temp_zip):
                os.remove(temp_zip)
            return {"status": "ERROR", "data": f"Folder lock failed: {str(e)}"}
        
    def unlock_file(self, container_name, restore_path):
        """Unlock a file or folder"""
        try:
            log_msg = f"Unlock request: container={container_name}, restore_path={restore_path}"
            sys.stderr.write(f"[ENGINE] {log_msg}\n")
            sys.stderr.flush()
            
            # Find container in index
            container_info = next((item for item in self.vault_index if item['container'] == container_name), None)
            if not container_info:
                sys.stderr.write(f"[ENGINE] Container not found in index\n")
                return {"status": "ERROR", "data": "Container not found in vault"}
            
            container_path = os.path.join(self.vault_path, container_name)
            if not os.path.exists(container_path):
                sys.stderr.write(f"[ENGINE] Container file not found: {container_path}\n")
                return {"status": "ERROR", "data": "Container file not found"}
            
            # Get metadata
            metadata = self.vault_metadata.get(container_name, {})
            item_type = metadata.get('type', container_info.get('type', 'file'))
            
            sys.stderr.write(f"[ENGINE] Item type: {item_type}\n")
            sys.stderr.flush()
            
            # Unhide container temporarily
            self._unhide_file_windows(container_path)
            
            # Read container
            with open(container_path, 'rb') as f:
                data = f.read()
            
            sys.stderr.write(f"[ENGINE] Read {len(data)} bytes from container\n")
            sys.stderr.flush()
            
            # Decrypt
            nonce = data[:12]
            ciphertext = data[12:]
            
            sys.stderr.write(f"[ENGINE] Nonce: {nonce.hex()[:20]}...\n")
            sys.stderr.write(f"[ENGINE] Ciphertext length: {len(ciphertext)}\n")
            sys.stderr.flush()
            
            try:
                aesgcm = AESGCM(self.key)
                plaintext = aesgcm.decrypt(nonce, ciphertext, None)
                sys.stderr.write(f"[ENGINE] Decrypted {len(plaintext)} bytes\n")
                sys.stderr.flush()
            except Exception as decrypt_err:
                sys.stderr.write(f"[ENGINE] Decryption failed: {str(decrypt_err)}\n")
                sys.stderr.flush()
                return {"status": "ERROR", "data": f"Decryption failed: {str(decrypt_err)}"}
            
            if item_type == 'folder':
                # Extract folder
                temp_zip = os.path.join(self.vault_path, f"temp_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip")
                
                with open(temp_zip, 'wb') as f:
                    f.write(plaintext)
                
                extract_dir = restore_path
                os.makedirs(extract_dir, exist_ok=True)
                
                try:
                    with zipfile.ZipFile(temp_zip, 'r') as zipf:
                        zipf.extractall(extract_dir)
                    sys.stderr.write(f"[ENGINE] Folder extracted to {extract_dir}\n")
                except Exception as zip_err:
                    sys.stderr.write(f"[ENGINE] Zip extraction failed: {str(zip_err)}\n")
                    if os.path.exists(temp_zip):
                        os.remove(temp_zip)
                    return {"status": "ERROR", "data": f"Extraction failed: {str(zip_err)}"}
                
                os.remove(temp_zip)
                original_name = metadata.get('original_name', 'restored_folder')
            else:
                # Write file
                try:
                    with open(restore_path, 'wb') as f:
                        f.write(plaintext)
                    sys.stderr.write(f"[ENGINE] File written to {restore_path}\n")
                except Exception as write_err:
                    sys.stderr.write(f"[ENGINE] File write failed: {str(write_err)}\n")
                    return {"status": "ERROR", "data": f"Write failed: {str(write_err)}"}
                original_name = metadata.get('original_name', 'restored_file')
            
            # Remove container
            os.remove(container_path)
            
            # Remove from index
            self.vault_index = [item for item in self.vault_index if item['container'] != container_name]
            
            # Remove metadata
            if container_name in self.vault_metadata:
                del self.vault_metadata[container_name]
            
            # Save changes
            self._save_index()
            self._save_metadata()
            
            sys.stderr.write(f"[ENGINE] ✓ Unlock successful: {original_name}\n")
            sys.stderr.flush()
            
            return {
                "status": "SUCCESS",
                "data": f"Unlocked: {original_name}",
                "restore_path": restore_path
            }
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            sys.stderr.write(f"[ENGINE] ✗ Unlock failed: {str(e)}\n{error_details}\n")
            sys.stderr.flush()
            return {"status": "ERROR", "data": f"Unlock failed: {str(e)}"}
    def delete_vault_item(self, container_name):
        """Permanently delete a vault item"""
        try:
            container_info = next((item for item in self.vault_index if item['container'] == container_name), None)
            if not container_info:
                return {"status": "ERROR", "data": "Container not found"}
            
            container_path = os.path.join(self.vault_path, container_name)
            if not os.path.exists(container_path):
                return {"status": "ERROR", "data": "Container file not found"}
            
            self._unhide_file_windows(container_path)
            
            metadata = self.vault_metadata.get(container_name, {})
            original_name = metadata.get('original_name', container_name)
            
            secure_delete_file(container_path)
            self.vault_index = [item for item in self.vault_index if item['container'] != container_name]
            
            if container_name in self.vault_metadata:
                del self.vault_metadata[container_name]
            
            self._save_index()
            self._save_metadata()
            
            return {
                "status": "SUCCESS",
                "data": f"Permanently deleted: {original_name}"
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Delete failed: {str(e)}"}
    
    def get_vault_list(self):
        """Get list of all vault items with metadata"""
        try:
            items = []
            for item in self.vault_index:
                container_name = item['container']
                metadata = self.vault_metadata.get(container_name, {})
                
                container_path = os.path.join(self.vault_path, container_name)
                exists = os.path.exists(container_path)
                
                items.append({
                    "container": container_name,
                    "original": item.get('original', ''),
                    "original_name": metadata.get('original_name', 'Unknown'),
                    "type": metadata.get('type', item.get('type', 'file')),
                    "original_size": metadata.get('original_size', 0),
                    "container_size": metadata.get('container_size', 0),
                    "locked_at": metadata.get('locked_at', ''),
                    "file_count": metadata.get('file_count', 1),
                    "exists": exists
                })
            
            return {
                "status": "OK",
                "data": items,
                "total_count": len(items)
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Failed to get vault list: {str(e)}"}
    
    def shred_file(self, file_path):
        """Securely shred a file"""
        if secure_delete_file(file_path):
            return {"status": "SUCCESS", "data": "File permanently destroyed"}
        else:
            return {"status": "ERROR", "data": "Shred failed"}
    
    def scan_for_hidden_files(self):
        """Scan vault directory for hidden .aegis files"""
        try:
            hidden_files = []
            vault_path = os.path.abspath(self.vault_path)
            
            for filename in os.listdir(vault_path):
                if filename.endswith('.aegis'):
                    file_path = os.path.join(vault_path, filename)
                    file_size = os.path.getsize(file_path)
                    in_index = any(item['container'] == filename for item in self.vault_index)
                    
                    hidden_files.append({
                        "container": filename,
                        "path": file_path,
                        "size": file_size,
                        "in_index": in_index
                    })
            
            return {"status": "OK", "data": {"found": len(hidden_files), "files": hidden_files}}
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Scan failed: {str(e)}"}