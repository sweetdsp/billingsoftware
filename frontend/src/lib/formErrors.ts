import axios from 'axios';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { getErrorMessage, getErrorStatus } from '../services/api';

interface ServerFieldError {
  /** Dotted field path, e.g. "lineItems.0.unitPrice". */
  path: string;
  message: string;
}

/** FastAPI 422 body → field errors. `loc` is `["body", "lineItems", 0, "unitPrice"]`. */
export function serverFieldErrors(err: unknown): ServerFieldError[] {
  if (!axios.isAxiosError(err) || err.response?.status !== 422) return [];
  const data: unknown = err.response.data;
  if (typeof data !== 'object' || data === null || !('detail' in data)) return [];
  const detail: unknown = data.detail;
  if (!Array.isArray(detail)) return [];
  const result: ServerFieldError[] = [];
  for (const item of detail as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const loc: unknown = 'loc' in item ? item.loc : undefined;
    const msg: unknown = 'msg' in item ? item.msg : undefined;
    if (!Array.isArray(loc) || typeof msg !== 'string') continue;
    const path = loc
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .filter((part, index) => !(index === 0 && part === 'body'))
      .join('.');
    if (path) result.push({ path, message: msg });
  }
  return result;
}

/**
 * Put an API error onto a react-hook-form form: 422 field errors go inline when the field exists
 * in `knownFields` (top-level names); everything else becomes `root.server`.
 * Returns true when at least one inline field error was set.
 */
export function applyServerError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): void {
  if (getErrorStatus(err) === 422) {
    const matched = serverFieldErrors(err).filter((e) => {
      const top = e.path.split('.')[0] ?? '';
      return knownFields.includes(top);
    });
    if (matched.length > 0) {
      matched.forEach(({ path, message }, index) => {
        setError(path as Path<T>, { type: 'server', message }, { shouldFocus: index === 0 });
      });
      return;
    }
  }
  setError('root.server' as Path<T>, { type: 'server', message: getErrorMessage(err) });
}
