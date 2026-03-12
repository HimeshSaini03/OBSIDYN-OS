import sys
import json
from core import SecurityCore
from ipc import SecureIPC
from utils import MemoryProtector

def log(message):
    sys.stderr.write(f"[ENGINE] {message}\n")
    sys.stderr.flush()

def main():
    log("Initializing OBSIDYN Security Core...")
    core = SecurityCore()
    ipc = SecureIPC(core)
    mem = MemoryProtector()
    
    log("Waiting for secure handshake...")
    
    while True:
        try:
            raw_line = sys.stdin.readline()
            if not raw_line:
                log("stdin closed, exiting")
                break
            
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            
            # Parse JSON command
            try:
                cmd = json.loads(raw_line)
                action = cmd.get("action")
                payload = cmd.get("payload", {})
            except json.JSONDecodeError:
                log(f"Invalid JSON received: {raw_line[:100]}")
                continue
            
            log(f"=== ACTION: {action} ===")
            log(f"Payload: {json.dumps(payload)[:200]}")
            
            # AUTH command
            if action == "AUTH":
                pwd_hash = payload.get("password_hash")
                if pwd_hash:
                    ipc.reset()
                    if ipc.handshake(pwd_hash):
                        log("✓ Authentication successful")
                        ipc.send({"status": "AUTH_SUCCESS", "data": "Session Established"}, force_unencrypted=True)
                    else:
                        log("✗ Authentication failed")
                        ipc.send({"status": "AUTH_FAIL", "data": "Invalid Credentials"}, force_unencrypted=True)
                else:
                    log("✗ No password provided")
                    ipc.send({"status": "AUTH_FAIL", "data": "No password provided"}, force_unencrypted=True)
                continue
            
            # LOGOUT command
            if action == "LOGOUT":
                ipc.reset()
                log("✓ Logout successful")
                ipc.send({"status": "LOGOUT_SUCCESS", "data": "Session terminated"}, force_unencrypted=True)
                continue
            
            # Require authentication
            if not ipc.authenticated:
                log("✗ Not authenticated")
                ipc.send({"status": "ERROR", "data": "Not authenticated"}, force_unencrypted=True)
                continue
            
            # Process commands
            try:
                if action == "PING":
                    response = {"status": "PONG", "data": None}
                
                elif action == "GET_STATUS":
                    response = {"status": "OK", "data": core.get_status()}
                    log(f"✓ Status returned: {json.dumps(response['data'])}")
                
                elif action == "LOCK_FILE":
                    if not core.vault:
                        log("✗ Vault not initialized")
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        file_path = payload.get("path")
                        log(f"→ Locking file: {file_path}")
                        response = core.vault.lock_file(file_path)
                        log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Lock result: {response['data']}")
                
                elif action == "LOCK_FOLDER":
                    if not core.vault:
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        folder_path = payload.get("path")
                        log(f"→ Locking folder: {folder_path}")
                        response = core.vault.lock_folder(folder_path)
                        log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Lock result: {response['data']}")
                
                elif action == "UNLOCK_FILE":
                    if not core.vault:
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        container = payload.get("container")
                        restore_path = payload.get("restore_path")
                        log(f"→ Unlocking: {container} to {restore_path}")
                        response = core.vault.unlock_file(container, restore_path)
                        log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Unlock result: {response['data']}")
                
                elif action == "DELETE_VAULT_ITEM":
                    if not core.vault:
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        container = payload.get("container")
                        log(f"→ Deleting: {container}")
                        response = core.vault.delete_vault_item(container)
                        log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Delete result: {response['data']}")
                
                elif action == "GET_VAULT_LIST":
                    if not core.vault:
                        response = {"status": "OK", "data": []}
                    else:
                        response = core.vault.get_vault_list()
                        item_count = len(response.get('data', []))
                        log(f"✓ Vault list returned: {item_count} items")
                        if item_count > 0:
                            log(f"  Items: {[item['original_name'] for item in response['data']]}")
                
                elif action == "SHRED_FILE":
                    if not core.vault:
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        file_path = payload.get("path")
                        log(f"→ Shredding file: {file_path}")
                        response = core.vault.shred_file(file_path)
                        log(f"{'✓' if response['status'] == 'SUCCESS' else '✗'} Shred result: {response['data']}")
                
                elif action == "SCAN_HIDDEN_FILES":
                    if not core.vault:
                        response = {"status": "ERROR", "data": "Vault not initialized"}
                    else:
                        response = core.vault.scan_for_hidden_files()
                        log(f"✓ Scan result: {json.dumps(response)}")
                
                else:
                    log(f"✗ Unknown action: {action}")
                    response = {"status": "ERROR", "data": f"Unknown action: {action}"}
                
                # Send response
                ipc.send(response)
                log(f"→ Response sent: {response['status']}")
                
            except Exception as cmd_error:
                log(f"✗ Command execution error: {str(cmd_error)}")
                import traceback
                traceback.print_exc()
                ipc.send({"status": "ERROR", "data": f"Command error: {str(cmd_error)}"})
            
        except Exception as e:
            log(f"✗ Critical Error: {str(e)}")
            import traceback
            traceback.print_exc()
            ipc.send({"status": "ERROR", "data": f"System Error: {str(e)}"})

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Shutdown requested")
    except Exception as e:
        log(f"Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()