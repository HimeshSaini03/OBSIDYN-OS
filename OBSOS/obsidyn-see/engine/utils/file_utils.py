"""File operation utilities."""
import json
import os
import tempfile
from datetime import datetime


class FileUtils:
    """File operation utilities."""

    @staticmethod
    def read_file(file_path):
        """Read file as bytes."""
        with open(file_path, 'rb') as file_handle:
            return file_handle.read()

    @staticmethod
    def write_file(file_path, data):
        """Write bytes to file atomically."""
        directory = os.path.dirname(file_path) or "."
        os.makedirs(directory, exist_ok=True)

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=directory, delete=False) as temp_file:
                temp_file.write(data)
                temp_file.flush()
                os.fsync(temp_file.fileno())
                temp_path = temp_file.name

            os.replace(temp_path, file_path)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    @staticmethod
    def write_json(file_path, data):
        """Write JSON atomically."""
        payload = json.dumps(data, indent=2).encode('utf-8')
        FileUtils.write_file(file_path, payload)

    @staticmethod
    def get_timestamp():
        """Get current timestamp string."""
        return datetime.now().isoformat(timespec='seconds')

    @staticmethod
    def count_folder_contents(folder_path):
        """Count files and total size in folder."""
        total_files = 0
        total_size = 0

        for root, _, files in os.walk(folder_path):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                total_files += 1
                total_size += os.path.getsize(file_path)

        return total_files, total_size

    @staticmethod
    def safe_extract_zip(zip_file, target_dir):
        """Extract a zip archive without allowing path traversal."""
        root_dir = os.path.abspath(target_dir)
        os.makedirs(root_dir, exist_ok=True)

        for member in zip_file.infolist():
            member_path = os.path.abspath(os.path.join(root_dir, member.filename))
            if not member_path.startswith(root_dir + os.sep) and member_path != root_dir:
                raise ValueError("Archive contains an invalid path")

        zip_file.extractall(root_dir)
