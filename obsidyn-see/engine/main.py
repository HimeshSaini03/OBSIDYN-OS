"""Main entry point"""
import sys
import json
from core.application import Application
from steganography.steganography_engine import SteganographyEngine

def log(message):
    """Log message to stderr"""
    sys.stderr.write(f"[ENGINE] {message}\n")
    sys.stderr.flush()

def main():
    """Main application loop"""
    log("Initializing OBSIDYN Security Core...")
    
    app = Application()
    app.initialize()
    
    log("Waiting for commands...")
    
    while True:
        try:
            raw_line = sys.stdin.readline()
            if not raw_line:
                log("stdin closed, exiting")
                break
            
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            
            try:
                cmd = json.loads(raw_line)
            except json.JSONDecodeError:
                log(f"Invalid JSON: {raw_line[:100]}")
                continue
            
            action = cmd.get("action")
            payload = cmd.get("payload", {})
            
            log(f"=== ACTION: {action} ===")
            
            if action == "AUTH":
                pwd_hash = payload.get("password_hash")
                if pwd_hash:
                    success, error = app.authenticate(pwd_hash)
                    if success:
                        log("✓ Authentication successful")
                        sys.stdout.write(json.dumps({
                            "status": "AUTH_SUCCESS",
                            "data": "Session Established"
                        }) + "\n")
                    else:
                        log(f"✗ Authentication failed: {error}")
                        sys.stdout.write(json.dumps({
                            "status": "AUTH_FAIL",
                            "data": error
                        }) + "\n")
                else:
                    sys.stdout.write(json.dumps({
                        "status": "AUTH_FAIL",
                        "data": "No password provided"
                    }) + "\n")
                sys.stdout.flush()
                continue
            
            if action == "LOGOUT":
                app.logout()
                log("✓ Logout successful")
                sys.stdout.write(json.dumps({
                    "status": "LOGOUT_SUCCESS",
                    "data": "Session terminated"
                }) + "\n")
                sys.stdout.flush()
                continue
            
            if not app.is_authenticated():
                sys.stdout.write(json.dumps({
                    "status": "ERROR",
                    "data": "Not authenticated"
                }) + "\n")
                sys.stdout.flush()
                continue
            
            vault = app.get_vault_manager()
            
            if action == "PING":
                response = {"status": "PONG", "data": None}
            
            elif action == "GET_STATUS":
                response = {"status": "OK", "data": {
                    "authenticated": app.is_authenticated(),
                    "vault_items": len(vault.get_vault_list().get('data', [])) if vault else 0
                }}
            
            elif action == "LOCK_FILE":
                if vault:
                    response = vault.lock_file(payload.get("path"))
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Lock result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            
            elif action == "LOCK_FOLDER":
                if vault:
                    response = vault.lock_folder(payload.get("path"))
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Lock result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            
            elif action == "UNLOCK_FILE":
                if vault:
                    response = vault.unlock_file(
                        payload.get("container"),
                        payload.get("restore_path")
                    )
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Unlock result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            
            elif action == "DELETE_VAULT_ITEM":
                if vault:
                    response = vault.delete_item(payload.get("container"))
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Delete result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            
            elif action == "GET_VAULT_LIST":
                if vault:
                    response = vault.get_vault_list()
                    log(f"✓ Vault list returned: {len(response.get('data', []))} items")
                else:
                    response = {"status": "OK", "data": []}

            elif action == "HIDE_DATA":
                if vault:
                    steg = SteganographyEngine(vault.session_key)
                    response = steg.hide_data(
                        payload.get("data_file"),
                        payload.get("image_file"),
                        payload.get("output_path"),
                        payload.get("password")
                    )
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Hide result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}

            elif action == "EXTRACT_DATA":
                if vault:
                    steg = SteganographyEngine(vault.session_key)
                    response = steg.extract_data(
                        payload.get("image_file"),
                        payload.get("output_path"),
                        payload.get("password")
                    )
                    log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Extract result: {response['data']}")
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}

            elif action == "SCAN_IMAGE":
                steg = SteganographyEngine()
                response = steg.scan_image(payload.get("image_file"))
                # Use stderr for logging, not stdout
                sys.stderr.write(f"[STEG] Scan result: {response.get('data', {}).get('message', 'Unknown')}\n")
                sys.stderr.flush()
            elif action == "SHRED_FILE":
                from security.secure_deleter import SecureDeleter
                deleter = SecureDeleter()
                if deleter.secure_delete(payload.get("path")):
                    response = {"status": "SUCCESS", "data": "File permanently destroyed"}
                else:
                    response = {"status": "ERROR", "data": "Shred failed"}
            
            else:
                response = {"status": "ERROR", "data": f"Unknown action: {action}"}
            
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            log(f"→ Response sent: {response['status']}")
            
        except Exception as e:
            log(f"✗ Critical Error: {str(e)}")
            import traceback
            traceback.print_exc()
            sys.stdout.write(json.dumps({
                "status": "ERROR",
                "data": f"System Error: {str(e)}"
            }) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Shutdown requested")
    except Exception as e:
        log(f"Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()