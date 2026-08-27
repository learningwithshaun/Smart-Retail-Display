"""Vercel serverless entry point for the FastAPI application."""

import sys
from pathlib import Path


# Vercel executes this file from the repository root, but the FastAPI package
# imports the top-level ``hardware`` package as well.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.main import app

