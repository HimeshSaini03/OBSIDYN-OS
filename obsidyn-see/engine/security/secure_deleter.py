"""Secure file deletion"""
import sys
import os

class SecureDeleter:
    """Securely deletes files with multiple overwrites"""
    
    def secure_delete(self, file_path):
        """Securely delete file with 3-pass overwrite"""
        if not os.path.exists(file_path):
            return False
        
        try:
            file_size = os.path.getsize(file_path)
            
            for _ in range(3):
                with open(file_path, 'wb') as f:
                    f.write(os.urandom(file_size))
                    f.flush()
                    os.fsync(f.fileno())
            
            os.remove(file_path)
            sys.stderr.write(f"[DELETER] Securely deleted: {file_path}\n")
            sys.stderr.flush()
            return True
            
        except Exception as e:
            sys.stderr.write(f"[DELETER] Secure delete failed: {e}\n")
            sys.stderr.flush()
            try:
                os.remove(file_path)
                return True
            except:
                return False