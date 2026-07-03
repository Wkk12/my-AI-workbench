import ast
from pathlib import Path
try:
    src = Path('gitlab_daily_report.py').read_text(encoding='utf-8')
    ast.parse(src)
    print('ok')
except Exception as e:
    import traceback
    traceback.print_exc()
