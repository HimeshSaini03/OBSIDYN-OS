import ctypes
import sys
import os

class MemoryProtector:
    def __init__(self):
        self.kernel32 = ctypes.windll.kernel32 if sys.platform == 'win32' else None

    def lock_memory(self, buffer):
        """Lock memory to prevent swapping"""
        if self.kernel32 and hasattr(buffer, 'ctypes'):
            addr = ctypes.addressof(buffer)
            size = len(buffer)
            self.kernel32.VirtualLock(ctypes.c_void_p(addr), ctypes.c_size_t(size))

    def unlock_memory(self, buffer):
        """Unlock memory"""
        if self.kernel32 and hasattr(buffer, 'ctypes'):
            addr = ctypes.addressof(buffer)
            size = len(buffer)
            self.kernel32.VirtualUnlock(ctypes.c_void_p(addr), ctypes.c_size_t(size))

    def secure_wipe(self, buffer):
        """Overwrite buffer with zeros"""
        if isinstance(buffer, bytearray):
            for i in range(len(buffer)):
                buffer[i] = 0
        return buffer

def secure_delete_file(file_path):
    """Securely delete file with multiple overwrites"""
    if not os.path.exists(file_path):
        return False
    
    try:
        file_size = os.path.getsize(file_path)
        
        # Multiple overwrite passes
        for _ in range(3):
            with open(file_path, 'wb') as f:
                f.write(os.urandom(file_size))
                f.flush()
                os.fsync(f.fileno())
        
        # Overwrite with zeros
        with open(file_path, 'wb') as f:
            f.write(b'\x00' * file_size)
            f.flush()
            os.fsync(f.fileno())
        
        # Delete file
        os.remove(file_path)
        return True
        
    except Exception as e:
        print(f"Secure delete failed: {e}")
        try:
            os.remove(file_path)
            return True
        except:
            return False