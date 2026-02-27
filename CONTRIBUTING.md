# Contributing to AnimeStudio

Cảm ơn bạn đã quan tâm đến dự án! Tài liệu này mô tả quy trình đóng góp code,  
viết script automation, và chuẩn coding convention.

---

## 📁 Cấu trúc Dự Án

```
AnimeStudio_Project/
├── backend/                # FastAPI Python backend
│   ├── main.py             # Entry point, routes
│   ├── studio_manager.py   # Scene/track/keyframe logic
│   └── *.json              # Local data stores (dev only)
├── frontend-react/         # React + TypeScript frontend
│   ├── src/
│   │   ├── components/     # React UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── store/          # Zustand global state
│   │   ├── stores/         # Feature-specific stores
│   │   ├── lib/            # Pure utility functions
│   │   └── types/          # TypeScript type definitions
├── scripts/                # CLI scripts & automation tools
├── ROADMAP.md              # Danh sách tính năng tương lai
└── CONTRIBUTING.md         # File này
```

---

## 🚀 Setup Dev Environment

```bash
# 1. Clone & cài backend
git clone https://github.com/khoatuan2006-eng/214Studio.git
cd AnimeStudio_Project
pip install -r requirements.txt
python backend/main.py          # Chạy tại http://localhost:8001

# 2. Cài frontend (terminal khác)
cd frontend-react
npm install
npm run dev                     # Chạy tại http://localhost:5173
```

Hoặc dùng script tiện lợi (sau khi được tạo):
```bash
bash scripts/dev.sh
```

---

## 🌿 Git Branching Strategy

Dùng mô hình **Feature Branch + Pull Request**:

```
main          ← stable production
dev           ← integration branch
feature/...   ← tính năng mới (từ dev)
fix/...       ← bug fix (từ dev)
script/...    ← script mới trong scripts/
```

**Quy tắc đặt tên branch:**
- `feature/timeline-undo-redo` (liên kết với ROADMAP mục 1.5)
- `fix/keyframe-delete-crash`
- `script/cli-export-video`
- `refactor/use-editor-split`

---

## ✅ Commit Convention (Conventional Commits)

```
<type>(<scope>): <short description>

feat(timeline): add undo/redo using Immer patches
fix(assets): prevent crash when asset hash is null
script(export): add CLI video export with ffmpeg
refactor(use-editor): extract splitElement helper
docs(roadmap): add P6 AI tools section
test(backend): add unit tests for scene API
chore(deps): upgrade vite to 6.x
```

Types: `feat`, `fix`, `script`, `refactor`, `docs`, `test`, `chore`, `perf`

---

## 📜 Script Development Guide

Tất cả script đặt trong `scripts/`. Mỗi script phải:

### Cấu trúc chuẩn (Python):

```python
#!/usr/bin/env python3
"""
scripts/export.py
-----------------
CLI export: Render một scene ra video/gif/png-sequence.

Usage:
    python scripts/export.py --project path/to/project.json \
        --scene "Episode 1" \
        --format mp4 \
        --fps 24 \
        --resolution 1920x1080 \
        --out output.mp4

Dependencies:
    pip install ffmpeg-python Pillow requests
"""

import argparse
import sys
from pathlib import Path

# ===================== CONFIG =====================
API_BASE = "http://localhost:8001"
DEFAULT_FPS = 24
DEFAULT_RESOLUTION = (1920, 1080)
# ==================================================


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", required=True, help="Path to project JSON file")
    parser.add_argument("--scene", default=None, help="Scene name to export (default: all)")
    parser.add_argument("--format", choices=["mp4", "gif", "webm", "png-seq", "sprite"], default="mp4")
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    parser.add_argument("--resolution", default="1920x1080")
    parser.add_argument("--out", required=True, help="Output file path")
    parser.add_argument("--dry-run", action="store_true", help="Validate without actually rendering")
    return parser.parse_args()


def main():
    args = parse_args()
    # TODO: implement
    print(f"[export] Project: {args.project}")
    print(f"[export] Format: {args.format} | FPS: {args.fps} | Out: {args.out}")
    if args.dry_run:
        print("[export] DRY RUN — no files written.")
        sys.exit(0)


if __name__ == "__main__":
    main()
```

### Checklist script mới:
- [ ] Có docstring mô tả rõ ràng với Usage và Dependencies
- [ ] Có `--help` flags đầy đủ via `argparse`
- [ ] Hỗ trợ `--dry-run` nếu script ghi file
- [ ] Có logging rõ ràng (`print("[module] message")`)
- [ ] Có error handling và exit codes (`sys.exit(1)` khi lỗi)
- [ ] Có test trong `tests/scripts/test_export.py`

---

## 🧹 Code Standards

### Backend (Python)

```bash
pip install ruff mypy
ruff check backend/        # Linting
mypy backend/              # Type checking
pytest tests/              # Unit tests
```

- Dùng **type hints** cho mọi function.
- Dùng **Pydantic models** cho request/response schemas.
- Không để logic trong `main.py`. Business logic vào `studio_manager.py` hoặc file mới.
- Endpoint mới phải có docstring mô tả purpose.

### Frontend (TypeScript / React)

```bash
cd frontend-react
npm run lint               # ESLint
npm run typecheck          # tsc --noEmit
npm test                   # Vitest
```

- Mọi hook mới đặt trong `src/hooks/`, pure util vào `src/lib/`.
- Không `any` type — dùng proper types từ `src/types/`.
- Component nhỏ < 150 LOC. Nếu lớn hơn → split thành sub-components.
- Prop types phải có interface rõ ràng.

---

## 🧪 Testing

### Backend
```bash
pytest tests/ -v                      # Chạy tất cả
pytest tests/test_scenes.py -v        # Chạy file cụ thể
pytest --cov=backend --cov-report=html  # Coverage report
```

### Frontend
```bash
cd frontend-react
npm test                  # Watch mode
npm run test:ci           # CI mode (no watch)
```

### E2E (Playwright - sau khi setup)
```bash
npx playwright test               # Chạy E2E tests
npx playwright test --ui          # Có UI mode
```

---

## 🗺️ Linking to ROADMAP

Khi tạo PR, trong description hãy link đến mục ROADMAP:

```markdown
## Mục ROADMAP
Implements ROADMAP.md > P1 > Section 3 > Item 3.6 (Copy/Paste Timeline Blocks)

## Changes
- Added Ctrl+C, Ctrl+V handling in `timeline/index.tsx`
- Added `copyElement`, `pasteElement` to `use-editor.ts`
- Tests: `src/hooks/__tests__/use-editor.test.ts`
```

---

## 📞 Liên hệ & Câu hỏi

Mở GitHub Issue với label `question` hoặc `discussion`.  
Tag @khoatuan2006-eng để được review PR nhanh hơn.
