"""Copy legacy bind-mounted uploads into the native Docker volume, never overwrite."""
from pathlib import Path
import shutil


def migrate(source=Path('/legacy'), destination=Path('/app/uploads')):
    if not source.is_dir():
        return 0
    destination.mkdir(parents=True, exist_ok=True)
    copied = 0
    for path in source.rglob('*'):
        if path.is_symlink() or not path.is_file():
            continue
        target = destination / path.relative_to(source)
        if not target.resolve().is_relative_to(destination.resolve()):
            raise ValueError('Upload migration target escaped the destination')
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
    return copied


if __name__ == '__main__':
    print(f'Migrated {migrate()} legacy upload files; existing files preserved.')
