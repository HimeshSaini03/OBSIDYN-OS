"""Image utilities for steganography"""
import sys
from PIL import Image
import os

class ImageUtils:
    """Image processing utilities"""
    
    def get_capacity(self, image_path):
        """
        Get maximum data capacity of image in bytes
        Args:
            image_path (str): Path to image
        Returns:
            int: Maximum bytes that can be hidden
        """
        try:
            img = Image.open(image_path)
            
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            pixels = img.width * img.height * 3  # RGB channels
            bits = pixels  # 1 bit per channel (LSB)
            bytes_capacity = bits // 8
            
            # Reserve 8 bytes for header
            usable_capacity = bytes_capacity - 8
            
            sys.stderr.write(f"[IMAGE] Capacity: {usable_capacity} bytes\n")
            sys.stderr.flush()
            
            return usable_capacity
            
        except Exception as e:
            sys.stderr.write(f"[IMAGE] Capacity check failed: {str(e)}\n")
            sys.stderr.flush()
            return 0
    
    def get_image_info(self, image_path):
        """
        Get image information
        Args:
            image_path (str): Path to image
        Returns:
            dict: Image information
        """
        try:
            img = Image.open(image_path)
            
            return {
                "width": img.width,
                "height": img.height,
                "mode": img.mode,
                "format": img.format,
                "size_bytes": os.path.getsize(image_path),
                "capacity_bytes": self.get_capacity(image_path)
            }
            
        except Exception as e:
            return {"error": str(e)}
    
    def validate_image(self, image_path):
        """
        Validate image for steganography
        Args:
            image_path (str): Path to image
        Returns:
            tuple: (is_valid, error_message)
        """
        if not os.path.exists(image_path):
            return False, "Image not found"
        
        try:
            img = Image.open(image_path)
            
            if img.format not in ['PNG', 'BMP', 'JPEG']:
                return False, f"Unsupported format: {img.format}"
            
            capacity = self.get_capacity(image_path)
            if capacity < 100:
                return False, "Image too small"
            
            return True, ""
            
        except Exception as e:
            return False, f"Invalid image: {str(e)}"