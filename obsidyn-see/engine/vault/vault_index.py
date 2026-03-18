"""Vault index management"""
import sys
import os
import json
from datetime import datetime
from utils.file_utils import FileUtils

class VaultIndex:
    """Manages vault index and metadata"""
    
    def __init__(self):
        self.index_path, self.metadata_path = self._get_paths()
        self.index = self._load_index()
        self.metadata = self._load_metadata()
    
    def _get_paths(self):
        """Get paths to index files"""
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        data_dir = os.path.join(project_root, "data")
        
        os.makedirs(data_dir, exist_ok=True)
        
        return (
            os.path.join(data_dir, "vault_index.json"),
            os.path.join(data_dir, "vault_metadata.json")
        )
    
    def get_vault_path(self, filename=None):
        """Get vault directory path"""
        engine_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        project_root = os.path.dirname(engine_dir)
        vault_path = os.path.join(project_root, "data", "vaults")
        
        os.makedirs(vault_path, exist_ok=True)
        
        if filename:
            return os.path.join(vault_path, filename)
        return vault_path
    
    def _load_index(self):
        """Load vault index from file"""
        try:
            if os.path.exists(self.index_path):
                with open(self.index_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            sys.stderr.write(f"[INDEX] Error loading index: {e}\n")
            sys.stderr.flush()
        return []
    
    def _load_metadata(self):
        """Load metadata from file"""
        try:
            if os.path.exists(self.metadata_path):
                with open(self.metadata_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            sys.stderr.write(f"[INDEX] Error loading metadata: {e}\n")
            sys.stderr.flush()
        return {}
    
    def _save_index(self):
        """Save index to file"""
        try:
            with open(self.index_path, 'w') as f:
                json.dump(self.index, f, indent=2)
        except Exception as e:
            sys.stderr.write(f"[INDEX] Error saving index: {e}\n")
            sys.stderr.flush()
    
    def _save_metadata(self):
        """Save metadata to file"""
        try:
            with open(self.metadata_path, 'w') as f:
                json.dump(self.metadata, f, indent=2)
        except Exception as e:
            sys.stderr.write(f"[INDEX] Error saving metadata: {e}\n")
            sys.stderr.flush()
    
    def generate_container_name(self, original_name):
        """Generate unique container name"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c for c in original_name if c.isalnum() or c in ('-', '_', '.')).rstrip()
        return f"{safe_name}.{timestamp}.aegis"
    
    def add_item(self, container_name, original_path, item_type, metadata):
        """Add item to index"""
        self.index.append({
            "container": container_name,
            "original": original_path,
            "type": item_type
        })
        self.metadata[container_name] = metadata
        self._save_index()
        self._save_metadata()
    
    def remove_item(self, container_name):
        """Remove item from index"""
        self.index = [item for item in self.index if item['container'] != container_name]
        if container_name in self.metadata:
            del self.metadata[container_name]
        self._save_index()
        self._save_metadata()
    
    def get_item(self, container_name):
        """Get item from index"""
        return next((item for item in self.index if item['container'] == container_name), None)
    
    def get_metadata(self, container_name):
        """Get metadata for item"""
        return self.metadata.get(container_name, {})
    
    def get_all_items(self):
        """Get all vault items"""
        items = []
        for item in self.index:
            container_name = item['container']
            metadata = self.metadata.get(container_name, {})
            container_path = self.get_vault_path(container_name)
            
            items.append({
                "container": container_name,
                "original": item.get('original', ''),
                "original_name": metadata.get('original_name', 'Unknown'),
                "type": metadata.get('type', item.get('type', 'file')),
                "original_size": metadata.get('original_size', 0),
                "container_size": metadata.get('container_size', 0),
                "locked_at": metadata.get('locked_at', ''),
                "file_count": metadata.get('file_count', 1),
                "exists": os.path.exists(container_path)
            })
        
        return {
            "status": "OK",
            "data": items,
            "total_count": len(items)
        }