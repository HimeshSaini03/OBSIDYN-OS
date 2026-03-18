"""Vault scanning logic"""
import sys
import os

class VaultScanner:
    """Scans vault directory for hidden files"""
    
    def __init__(self):
        self.vault_path = self._get_vault_path()
    
    def _get_vault_path(self):
        """Get vault directory path"""
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        return os.path.join(project_root, "data", "vaults")
    
    def scan(self):
        """
        Scan for hidden .aegis files
        Returns:
            dict: Result with found files
        """
        try:
            hidden_files = []
            
            for filename in os.listdir(self.vault_path):
                if filename.endswith('.aegis'):
                    file_path = os.path.join(self.vault_path, filename)
                    file_size = os.path.getsize(file_path)
                    
                    hidden_files.append({
                        "container": filename,
                        "path": file_path,
                        "size": file_size
                    })
            
            return {
                "status": "OK",
                "data": {
                    "found": len(hidden_files),
                    "files": hidden_files
                }
            }
            
        except Exception as e:
            return {"status": "ERROR", "data": f"Scan failed: {str(e)}"}