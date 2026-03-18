"""Main steganography orchestration"""
import sys
import os
from .lsb_encoder import LSBEncoder
from .lsb_decoder import LSBDecoder
from .image_utils import ImageUtils
from crypto.cipher import Cipher
from utils.file_utils import FileUtils
import zipfile
import tempfile
import time

class SteganographyEngine:
    """Main steganography engine"""
    
    def __init__(self, session_key=None):
        self.encoder = LSBEncoder()
        self.decoder = LSBDecoder()
        self.image_utils = ImageUtils()
        self.session_key = session_key
        
    def hide_data(self, data_file_path, image_path, output_path=None, password=None):
        """Hide any file inside an image"""
        try:
            sys.stderr.write(f"[STEG] Hiding data: {data_file_path}\n")
            sys.stderr.write(f"[STEG] Carrier image: {image_path}\n")
            sys.stderr.write(f"[STEG] Output path: {output_path}\n")
            sys.stderr.flush()
            
            # Validate files
            if not os.path.exists(data_file_path):
                return {"status": "ERROR", "data": "Data file not found"}
            
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Carrier image not found"}
            
            # Check image capacity
            capacity = self.image_utils.get_capacity(image_path)
            data_size = os.path.getsize(data_file_path)
            
            if data_size > capacity:
                return {
                    "status": "ERROR",
                    "data": f"File too large. Max: {capacity} bytes, File: {data_size} bytes"
                }
            
            # Read data file
            data = FileUtils.read_file(data_file_path)
            
            # Compress data (ZIP)
            compressed_data = self._compress_data(data)
            sys.stderr.write(f"[STEG] Original: {len(data)}B, Compressed: {len(compressed_data)}B\n")
            sys.stderr.flush()
            
            # Encrypt if password provided
            if password and password.strip():
                encrypted_data = Cipher.encrypt(self._get_key(password), compressed_data.decode('latin-1'))
                final_data = encrypted_data.encode('latin-1')
                sys.stderr.write("[STEG] Data encrypted with password\n")
                sys.stderr.flush()
            else:
                final_data = compressed_data
            
            # Add OBSIDYN header
            header = b'OBS'  # Magic bytes
            header += len(final_data).to_bytes(4, 'big')  # Data length (4 bytes)
            header += b'\x01'  # Version
            payload = header + final_data
            
            sys.stderr.write(f"[STEG] Total payload: {len(payload)} bytes\n")
            sys.stderr.flush()
            
            # Generate output path if not provided
            if output_path is None:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                output_path = os.path.join(os.path.dirname(image_path), f"{base_name}_hidden.png")
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
            
            # Encode in image
            self.encoder.encode(image_path, payload, output_path)
            
            sys.stderr.write(f"[STEG] ✓ Data hidden: {output_path}\n")
            sys.stderr.flush()
            
            return {
                "status": "SUCCESS",
                "data": f"Data hidden in {os.path.basename(output_path)}",
                "output_path": output_path,
                "original_size": len(data),
                "compressed_size": len(compressed_data),
                "output_size": os.path.getsize(output_path)
            }
            
        except Exception as e:
            import traceback
            sys.stderr.write(f"[STEG] ✗ Hide failed: {str(e)}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            return {"status": "ERROR", "data": f"Hide failed: {str(e)}"}
    
    def extract_data(self, image_path, output_path=None, password=None):
        """Extract hidden data from image"""
        try:
            sys.stderr.write(f"[STEG] Extracting from: {image_path}\n")
            sys.stderr.flush()
            
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Image not found"}
            
            # Decode from image
            payload = self.decoder.decode(image_path)
            
            if not payload:
                return {"status": "ERROR", "data": "No hidden data found in this image"}
            
            # Verify OBSIDYN header
            if len(payload) < 8 or payload[:3] != b'OBS':
                return {"status": "ERROR", "data": "Not an OBSIDYN steganography image"}
            
            # Read data length and version
            data_length = int.from_bytes(payload[3:7], 'big')
            version = payload[7]
            
            sys.stderr.write(f"[STEG] Header OK | Ver:{version} | Data:{data_length}B\n")
            sys.stderr.flush()
            
            # Extract encrypted/compressed data
            encrypted_data = payload[8:8+data_length]
            
            # Decrypt if password provided
            if password and password.strip():
                try:
                    compressed_data = Cipher.decrypt(self._get_key(password), encrypted_data.decode('latin-1'))
                    compressed_data = compressed_data.encode('latin-1')
                    sys.stderr.write("[STEG] ✓ Data decrypted\n")
                    sys.stderr.flush()
                except Exception as e:
                    return {"status": "ERROR", "data": f"Wrong password or corrupted data"}
            else:
                compressed_data = encrypted_data
            
            # Decompress
            data = self._decompress_data(compressed_data)
            
            # Generate output path if not provided
            if output_path is None:
                output_path = os.path.join(os.path.dirname(image_path), "extracted_data.bin")
            
            # Save to file
            FileUtils.write_file(output_path, data)
            
            sys.stderr.write(f"[STEG] ✓ Extracted: {output_path} ({len(data)}B)\n")
            sys.stderr.flush()
            
            return {
                "status": "SUCCESS",
                "data": f"Data extracted: {os.path.basename(output_path)}",
                "output_path": output_path,
                "extracted_size": len(data)
            }
            
        except Exception as e:
            import traceback
            sys.stderr.write(f"[STEG] ✗ Extract failed: {str(e)}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            return {"status": "ERROR", "data": f"Extract failed: {str(e)}"}
    
    def scan_image(self, image_path):
        """Check if image contains hidden OBSIDYN data"""
        try:
            if not os.path.exists(image_path):
                return {"status": "ERROR", "data": "Image not found"}
            
            # Get image info
            info = self.image_utils.get_image_info(image_path)
            
            # Try to decode payload
            payload = self.decoder.decode(image_path)
            
            result = {
                "status": "OK",
                "action": "SCAN_IMAGE",
                "data": {
                    "image_info": info,
                    "has_hidden_data": False,
                    "is_obsidyn": False,
                    "message": "No hidden data detected"
                }
            }
            
            if payload and len(payload) >= 8:
                # Check OBSIDYN header
                if payload[:3] == b'OBS':
                    data_length = int.from_bytes(payload[3:7], 'big')
                    version = payload[7]
                    
                    result["data"] = {
                        "has_hidden_data": True,
                        "is_obsidyn": True,
                        "version": version,
                        "hidden_data_size": data_length,
                        "password_protected": "Unknown (try extraction)",
                        "message": f"OBSIDYN data detected ({data_length} bytes)"
                    }
                else:
                    result["data"] = {
                        "has_hidden_data": True,
                        "is_obsidyn": False,
                        "message": "Hidden data found but not OBSIDYN format"
                    }
            
            sys.stderr.write(f"[STEG] Scan complete: {result['data']['message']}\n")
            sys.stderr.flush()
            return result
                    
        except Exception as e:
            import traceback
            return {"status": "ERROR", "data": f"Scan failed: {str(e)}\n{traceback.format_exc()}"}    
    
    def _compress_data(self, data):
        """Compress data using ZIP"""
        import io
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
            zipf.writestr('data.bin', data)
        return buffer.getvalue()
    
    def _decompress_data(self, compressed_data):
        """Decompress ZIP data"""
        import io
        buffer = io.BytesIO(compressed_data)
        with zipfile.ZipFile(buffer, 'r') as zipf:
            return zipf.read('data.bin')
    
    def _get_key(self, password):
        """Derive key from password"""
        import hashlib
        if self.session_key:
            return self.session_key
        return hashlib.sha256(password.encode()).digest()[:32]