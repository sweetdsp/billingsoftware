import { useEffect, useState } from 'react';
import { fetchUploadBlob } from '../services/uploadService';

export interface AuthedObjectUrlState {
  /** `blob:` URL usable as an `<img src>`, or null while loading / without an upload. */
  url: string | null;
  isLoading: boolean;
  isError: boolean;
}

const EMPTY: AuthedObjectUrlState = { url: null, isLoading: false, isError: false };

/**
 * Loads an owner-only upload (`GET /uploads/{id}` needs the bearer token) through the axios
 * instance and exposes it as an object URL. The URL is revoked when the id changes or on unmount.
 */
export function useAuthedObjectUrl(uploadId: number | null | undefined): AuthedObjectUrlState {
  const [state, setState] = useState<AuthedObjectUrlState>(EMPTY);

  useEffect(() => {
    if (uploadId === null || uploadId === undefined) {
      setState(EMPTY);
      return undefined;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, isLoading: true, isError: false });

    fetchUploadBlob(uploadId)
      .then((blob) => {
        if (cancelled) return;
        if (typeof URL.createObjectURL !== 'function') {
          setState({ url: null, isLoading: false, isError: true });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, isLoading: false, isError: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, isLoading: false, isError: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [uploadId]);

  return state;
}

export default useAuthedObjectUrl;
