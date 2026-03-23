"""Main entry point."""
import json
import sys

from core.application import Application
from steganography.steganography_engine import SteganographyEngine
from utils.logger import log, log_exception


def write_response(payload):
    """Write a JSON response to stdout."""
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main():
    """Main application loop."""
    log("[ENGINE] Initializing OBSIDYN core", level="DEBUG")

    app = Application()
    app.initialize()

    while True:
        try:
            raw_line = sys.stdin.readline()
            if not raw_line:
                log("[ENGINE] stdin closed, exiting", level="DEBUG")
                break

            raw_line = raw_line.strip()
            if not raw_line:
                continue

            try:
                cmd = json.loads(raw_line)
            except json.JSONDecodeError:
                log("[ENGINE] Invalid JSON command", level="ERROR")
                continue

            action = cmd.get("action")
            payload = cmd.get("payload", {})
            vault = app.get_vault_manager()

            if action == "AUTH":
                pwd_hash = payload.get("password_hash")
                if not pwd_hash:
                    write_response(
                        {
                            "status": "AUTH_FAIL",
                            "action": "AUTH",
                            "data": {"message": "No password provided", "behavioral": {}},
                        }
                    )
                    continue

                success, message, behavioral = app.authenticate(
                    pwd_hash,
                    payload.get("keystroke_sample"),
                    payload.get("recovery_payload"),
                )
                write_response(
                    {
                        "status": "AUTH_SUCCESS" if success else "AUTH_FAIL",
                        "action": "AUTH",
                        "data": {
                            "message": "Session established" if success else message,
                            "behavioral": behavioral,
                        },
                    }
                )
                continue

            if action == "GET_AUTH_STATUS":
                write_response(
                    {"status": "OK", "action": "GET_AUTH_STATUS", "data": app.get_auth_status()}
                )
                continue

            if action == "AUTH_VISUAL_RECOVERY":
                success, message, behavioral = app.authenticate_visual_recovery(
                    payload.get("recovery_payload")
                )
                write_response(
                    {
                        "status": "AUTH_SUCCESS" if success else "AUTH_FAIL",
                        "action": "AUTH_VISUAL_RECOVERY",
                        "data": {
                            "message": "Visual recovery session established" if success else message,
                            "behavioral": behavioral,
                        },
                    }
                )
                continue

            if action == "GET_APP_SETTINGS":
                response = app.get_app_settings()
                response["action"] = "GET_APP_SETTINGS"
                write_response(response)
                continue

            if action == "LOGOUT":
                app.logout()
                write_response(
                    {
                        "status": "LOGOUT_SUCCESS",
                        "action": "LOGOUT",
                        "data": "Session terminated",
                    }
                )
                continue

            if not app.is_authenticated():
                write_response({"status": "ERROR", "data": "Not authenticated"})
                continue

            if action == "PING":
                response = {"status": "PONG", "data": None}
            elif action == "GET_STATUS":
                response = {
                    "status": "OK",
                    "data": {
                        "authenticated": app.is_authenticated(),
                        "vault_items": len(vault.get_vault_list().get("data", []))
                        if vault
                        else 0,
                    },
                }
            elif action == "GET_OPERATOR_PROFILE":
                response = app.get_operator_profile()
            elif action == "SAVE_OPERATOR_PROFILE":
                response = app.save_operator_profile(payload.get("profile", {}))
            elif action == "UPDATE_APP_SETTINGS":
                response = app.update_app_settings(payload)
            elif action == "UPDATE_RHYTHM_POLICY":
                response = app.update_rhythm_policy(
                    payload.get("minimum_training_samples"),
                    payload.get("threshold"),
                )
            elif action == "ENROLL_VISUAL_RECOVERY":
                response = app.enroll_visual_recovery(
                    payload.get("face_image"),
                    payload.get("gesture_image"),
                    payload.get("gesture_label"),
                )
            elif action == "DELETE_VISUAL_RECOVERY":
                response = app.delete_visual_recovery()
            elif action == "ROTATE_MASTER_KEY":
                response = app.rotate_master_key(
                    payload.get("current_password_hash"),
                    payload.get("new_password_hash"),
                )
            elif action == "LOCK_FILE":
                response = (
                    vault.lock_file(payload.get("path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "LOCK_FOLDER":
                response = (
                    vault.lock_folder(payload.get("path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "UNLOCK_FILE":
                response = (
                    vault.unlock_file(payload.get("container"), payload.get("restore_path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "UNLOCK_FOLDER":
                response = (
                    vault.unlock_folder(payload.get("container"), payload.get("restore_path"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "DELETE_VAULT_ITEM":
                response = (
                    vault.delete_item(payload.get("container"))
                    if vault
                    else {"status": "ERROR", "data": "Vault not initialized"}
                )
            elif action == "GET_VAULT_LIST":
                response = (
                    vault.get_vault_list()
                    if vault
                    else {"status": "OK", "data": [], "total_count": 0}
                )
            elif action == "CREATE_DECOY_VAULT":
                response = app.create_decoy_vault(
                    payload.get("target_dir"),
                    payload.get("profile", "operations"),
                    int(payload.get("file_count", 3) or 3),
                )
            elif action == "GET_DECOY_STATUS":
                response = app.get_decoy_status()
            elif action == "START_MONITORING":
                response = app.start_monitoring()
            elif action == "STOP_MONITORING":
                response = app.stop_monitoring()
            elif action == "GET_MONITOR_STATUS":
                response = app.get_monitor_status()
            elif action == "HIDE_DATA":
                if vault:
                    steg = SteganographyEngine(vault.session_key)
                    response = steg.hide_data(
                        payload.get("data_file"),
                        payload.get("image_file"),
                        payload.get("output_path"),
                        payload.get("password"),
                    )
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            elif action == "EXTRACT_DATA":
                if vault:
                    steg = SteganographyEngine(vault.session_key)
                    response = steg.extract_data(
                        payload.get("image_file"),
                        payload.get("output_path"),
                        payload.get("password"),
                    )
                else:
                    response = {"status": "ERROR", "data": "Vault not initialized"}
            elif action == "SCAN_IMAGE":
                response = SteganographyEngine().scan_image(payload.get("image_file"))
            elif action == "SHRED_FILE":
                from security.secure_deleter import SecureDeleter

                deleter = SecureDeleter()
                success = deleter.secure_delete(payload.get("path"))
                response = {
                    "status": "SUCCESS" if success else "ERROR",
                    "data": "File permanently destroyed" if success else "Shred failed",
                }
            else:
                response = {"status": "ERROR", "data": f"Unknown action: {action}"}

            if isinstance(response, dict) and "action" not in response:
                response["action"] = action

            write_response(response)
        except Exception as exc:
            log_exception(f"[ENGINE] Critical error: {exc}", exc)
            write_response({"status": "ERROR", "data": f"System error: {exc}"})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("[ENGINE] Shutdown requested", level="DEBUG")
    except Exception as exc:
        log_exception(f"[ENGINE] Fatal error: {exc}", exc)
