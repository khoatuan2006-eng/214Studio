/**
 * Centralized API Configuration for AnimeStudio
 * =============================================
 * Supports two modes:
 *   - Local Execution: Default http://localhost:8001
 *   - Cloud Execution:  Set VITE_API_BASE_URL env var to your Colab/Cloud URL
 *
 * Usage:
 *   # .env.local (for cloud/colab mode)
 *   VITE_API_BASE_URL=https://xxxx-xxx.ngrok-free.app
 *
 *   # Or via command line
 *   VITE_API_BASE_URL=https://colab-url npm run dev
 */

export const API_BASE_URL: string =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

/** REST API base — append endpoint paths to this */
export const API_BASE: string = `${API_BASE_URL}/api`;

/** Static files base — for assets, thumbnails, etc. */
export const STATIC_BASE: string = `${API_BASE_URL}/static`;
