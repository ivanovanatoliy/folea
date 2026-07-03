import type { Diagnostic } from '../../shared/worker/typst';

export class FoleaTypstDiagnosticError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(message: string, diagnostic: Partial<Diagnostic> = {}) {
    super(message);
    this.name = 'FoleaTypstDiagnosticError';
    this.diagnostic = {
      severity: diagnostic.severity ?? 'error',
      message,
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
      ...(diagnostic.range === undefined ? {} : { range: diagnostic.range })
    };
  }
}

interface CompileOutput {
  readonly result?: Uint8Array;
  readonly hasError?: boolean;
  readonly diagnostics?: readonly unknown[];
}

export const parseCompileOutput = (value: unknown): CompileOutput => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { hasError: true, diagnostics: [fallbackDiagnostic('malformed compiler response')] };
  }

  const record = value as Record<string, unknown>;
  const result = record.result;
  const hasError = record.hasError;
  const diagnostics = record.diagnostics;

  return {
    ...(result instanceof Uint8Array ? { result } : {}),
    ...(typeof hasError === 'boolean' ? { hasError } : {}),
    ...(Array.isArray(diagnostics) ? { diagnostics } : {})
  };
};

export const normalizeDiagnostics = (values: readonly unknown[] | undefined): Diagnostic[] => {
  if (!values) {
    return [];
  }

  return values.map((value) => {
    if (typeof value === 'string') {
      return fallbackDiagnostic(cleanFoleaDiagnosticString(value));
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return fallbackDiagnostic('unknown typst diagnostic');
    }

    const record = value as Record<string, unknown>;
    const severity = normalizeSeverity(record.severity);
    const message =
      typeof record.message === 'string' && record.message.length > 0
        ? cleanFoleaDiagnosticString(record.message)
        : 'unknown typst diagnostic';
    const path = typeof record.path === 'string' ? record.path : undefined;
    const range = typeof record.range === 'string' ? record.range : undefined;

    return {
      severity,
      message,
      ...(path === undefined ? {} : { path }),
      ...(range === undefined ? {} : { range })
    };
  });
};

const cleanFoleaDiagnosticString = (message: string): string => {
  const sentinelMatch = /FoleaTypstDiagnosticError: ([^\n)]+)/.exec(message);
  return sentinelMatch?.[1] ?? message;
};

export const fallbackDiagnostic = (message: string): Diagnostic => ({
  severity: 'error',
  message
});

export const diagnosticFromThrown = (error: unknown): Diagnostic => {
  if (error instanceof FoleaTypstDiagnosticError) {
    return error.diagnostic;
  }

  return fallbackDiagnostic(error instanceof Error ? error.message : String(error));
};

const normalizeSeverity = (value: unknown): Diagnostic['severity'] => {
  switch (value) {
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    case 'hint':
      return 'hint';
    case 'error':
    default:
      return 'error';
  }
};
