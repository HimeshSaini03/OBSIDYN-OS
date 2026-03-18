"""File operation utilities"""
import os
from datetime import datetime

class FileUtils:
    """File operation utilities"""
    
    @staticmethod
    def read_file(file_path):
        """Read file as bytes"""
        with open(file_path, 'rb') as f:
            return f.read()
    
    @staticmethod
    def write_file(file_path, data):
        """Write bytes to file"""
        with open(file_path, 'wb') as f:
            f.write(data)
    
    @staticmethod
    def get_timestamp():
        """Get current timestamp string"""
        return datetime.now().isoformat()
    
    @staticmethod
    def count_folder_contents(folder_path):
        """Count files and total size in folder"""
        total_files = 0
        total_size = 0
        
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                total_files += 1
                total_size += os.path.getsize(file_path)
        
        return total_files, total_size