"""LSB Encoding for hiding data in images"""
import sys
import numpy as np
from PIL import Image

class LSBEncoder:
    """Encodes data into image using LSB steganography"""
    
    def encode(self, image_path, data, output_path):
        """
        Encode data into image using LSB
        Args:
            image_path (str): Path to carrier image
            data (bytes): Data to hide
            output_path (str): Path for output image
        Returns:
            bool: Success status
        """
        try:
            sys.stderr.write(f"[LSB] Encoding {len(data)} bytes into image\n")
            sys.stderr.flush()
            
            # Open image and ensure RGB mode
            img = Image.open(image_path).convert('RGB')
            
            # Convert to numpy array with explicit uint8 dtype
            pixels = np.array(img, dtype=np.uint8)
            original_shape = pixels.shape
            
            # Flatten pixels to 1D array
            flat_pixels = pixels.flatten().astype(np.uint8)
            
            # Convert data to binary string
            binary_data = self._bytes_to_binary(data)
            
            # Add end marker
            binary_data += '1111111111111110'  # 16-bit end delimiter
            
            sys.stderr.write(f"[LSB] Binary data length: {len(binary_data)} bits\n")
            sys.stderr.flush()
            
            # Check capacity
            max_bits = len(flat_pixels)
            if len(binary_data) > max_bits:
                raise Exception(f"Data too large. Need {len(binary_data)} bits, have {max_bits}")
            
            # Encode data in LSB - SAFE METHOD
            for i, bit_char in enumerate(binary_data):
                bit = int(bit_char)
                # Clear LSB safely and set new bit
                # Ensure we stay in uint8 range (0-255)
                pixel_value = int(flat_pixels[i]) & 254  # Clear LSB (mask with 11111110)
                new_value = (pixel_value | bit) & 255     # Set new bit and ensure 0-255
                flat_pixels[i] = np.uint8(new_value)
            
            # Reshape back to original image dimensions
            modified_pixels = flat_pixels.reshape(original_shape).astype(np.uint8)
            
            # Create output image with explicit mode and dtype
            output_img = Image.fromarray(modified_pixels, mode='RGB')
            output_img.save(output_path, 'PNG', compress_level=0)
            
            sys.stderr.write(f"[LSB] Encoding complete: {output_path}\n")
            sys.stderr.flush()
            
            return True
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            sys.stderr.write(f"[LSB] Encoding failed: {str(e)}\n{error_details}\n")
            sys.stderr.flush()
            raise
    
    def _bytes_to_binary(self, data):
        """Convert bytes to binary string"""
        return ''.join(format(byte, '08b') for byte in data)