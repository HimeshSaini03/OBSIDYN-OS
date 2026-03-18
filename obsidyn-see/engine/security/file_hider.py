"""File hiding for Windows"""
import sys
import ctypes

class FileHider:
    """Hides files from Windows Explorer"""
    
    def hide(self, file_path):
        """Hide file using SYSTEM + HIDDEN attributes"""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x02 | 0x04)
            sys.stderr.write(f"[HIDER] Hidden: {file_path}\n")
            sys.stderr.flush()
            return True
        except Exception as e:
            sys.stderr.write(f"[HIDER] Hide failed: {e}\n")
            sys.stderr.flush()
            return False
    
    def unhide(self, file_path):
        """Unhide file"""
        try:
            ctypes.windll.kernel32.SetFileAttributesW(file_path, 0x80)
            sys.stderr.write(f"[HIDER] Unhidden: {file_path}\n")
            sys.stderr.flush()
            return True
        except Exception as e:
            sys.stderr.write(f"[HIDER] Unhide failed: {e}\n")
            sys.stderr.flush()
            return False