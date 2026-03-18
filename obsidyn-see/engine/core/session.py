"""Session management"""
import sys

class Session:
    """Manages user session state"""
    
    def __init__(self):
        self.authenticated = False
        self.session_key = None
        self.username = None
        
    def set_authenticated(self, value):
        """Set authentication status"""
        self.authenticated = value
        sys.stderr.write(f"[SESSION] Authenticated: {value}\n")
        sys.stderr.flush()
    
    def is_authenticated(self):
        """Check authentication status"""
        return self.authenticated
    
    def set_session_key(self, key):
        """Set session encryption key"""
        self.session_key = key
        sys.stderr.write("[SESSION] Session key set\n")
        sys.stderr.flush()
    
    def get_session_key(self):
        """Get session encryption key"""
        return self.session_key
    
    def set_username(self, username):
        """Set username"""
        self.username = username
    
    def get_username(self):
        """Get username"""
        return self.username
    
    def reset(self):
        """Reset session"""
        self.authenticated = False
        self.session_key = None
        self.username = None
        sys.stderr.write("[SESSION] Session reset\n")
        sys.stderr.flush()