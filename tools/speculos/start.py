"""Load the private development seed without putting it in Docker command arguments."""
from pathlib import Path
import re
import sys
from speculos.main import main

seed = Path('/run/obolos/device.seed').read_text().strip()
if not re.fullmatch(r'[0-9a-f]{128}', seed):
    raise SystemExit('Invalid private emulator seed file')
sys.argv.extend(['--seed', 'hex:' + seed])
main()
