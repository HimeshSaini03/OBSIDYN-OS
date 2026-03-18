"""Main application orchestration"""
import sys
import os
from .session import Session
from auth.authenticator import Authenticator
from vault.vault_manager import VaultManager
from config.config_manager import ConfigManager

class Application:
    """Main application class"""
    
    def __init__(self):
        self.session = Session()
        self.config = ConfigManager()
        self.authenticator = None
        self.vault_manager = None
        
    def initialize(self):
        """Initialize application components"""
        self.authenticator = Authenticator()
        sys.stderr.write("[APP] Application initialized\n")
        sys.stderr.flush()
        
    def authenticate(self, password_hash):
        """Authenticate user"""
        if not self.authenticator:
            return False, "Authenticator not initialized"
        
        success, error = self.authenticator.authenticate(password_hash)
        if success:
            self.session.set_authenticated(True)
            self.vault_manager = VaultManager(self.authenticator.get_session_key())
            return True, "Authentication successful"
        return False, error
    
    def logout(self):
        """Logout user"""
        self.session.set_authenticated(False)
        self.session.set_session_key(None)
        self.vault_manager = None
        sys.stderr.write("[APP] User logged out\n")
        sys.stderr.flush()
    
    def is_authenticated(self):
        """Check if user is authenticated"""
        return self.session.is_authenticated()
    
    def get_vault_manager(self):
        """Get vault manager instance"""
        return self.vault_manager