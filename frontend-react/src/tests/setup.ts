import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch
const globalAny: any = globalThis;
globalAny.fetch = vi.fn();
