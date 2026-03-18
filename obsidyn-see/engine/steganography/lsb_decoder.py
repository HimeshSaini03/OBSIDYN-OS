"""LSB Decoding for extracting data from images"""
import sys
import numpy as np
from PIL import Image

class LSBDecoder:
    """Decodes data from image using LSB steganography"""
    
    def decode(self, image_path):
        """
        Decode hidden data from image
        Args:
            image_path (str): Path to image with hidden data
        Returns:
            bytes: Extracted data or None if no data found
        """
        try:
            sys.stderr.write(f"[LSB] Decoding from: {image_path}\n")
            sys.stderr.flush()
            
            # Open image and ensure RGB mode
            img = Image.open(image_path).convert('RGB')
            
            # Convert to numpy array with explicit uint8 dtype
            pixels = np.array(img, dtype=np.uint8)
            
            # Flatten pixels to 1D array
            flat_pixels = pixels.flatten().astype(np.uint8)
            
            # Extract LSBs safely
            binary_string = ''.join(str(int(pixel) & 1) for pixel in flat_pixels)
            
            # Find end marker
            end_marker = '1111111111111110'
            end_index = binary_string.find(end_marker)
            
            if end_index == -1:
                sys.stderr.write("[LSB] No end marker found\n")
                sys.stderr.flush()
                return None
            
            # Extract binary data (without end marker)
            binary_data = binary_string[:end_index]
            
            # Convert to bytes
            data = self._binary_to_bytes(binary_data)
            
            sys.stderr.write(f"[LSB] Decoded {len(data)} bytes\n")
            sys.stderr.flush()
            
            return data
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            sys.stderr.write(f"[LSB] Decoding failed: {str(e)}\n{error_details}\n")
            sys.stderr.flush()
            return None
    
    def _binary_to_bytes(self, binary_string):
        """Convert binary string to bytes"""
        if not binary_string:
            return b''
        
        # Pad to multiple of 8
        padding = (8 - len(binary_string) % 8) % 8
        binary_string = '0' * padding + binary_string
        
        # Convert to bytes safely
        byte_array = bytearray()
        for i in range(0, len(binary_string), 8):
            byte_val = int(binary_string[i:i+8], 2)
            byte_array.append(byte_val & 255)  # Ensure 0-255
        
        return bytes(byte_array)