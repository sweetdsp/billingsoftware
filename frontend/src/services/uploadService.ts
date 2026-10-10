import type { FilePurpose, UploadedFile } from '../types';
import { api } from './api';

/** Purposes a client may upload (bill PDFs are generated server-side). */
export type ClientFilePurpose = Extract<FilePurpose, 'logo' | 'attachment'>;

/** Mirrors backend `LOGO_MAX_BYTES` (backend/app/services/upload_service.py). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Content types accepted for logos (PNG / JPEG / SVG). */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg'] as const;

/** Backend 400 error codes from `POST /uploads`. */
export type UploadErrorCode = 'unsupported_file_type' | 'file_too_large' | 'unsafe_svg';

/** `POST /uploads` (multipart). */
export async function uploadFile(file: File, purpose: ClientFilePurpose): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);
  const { data } = await api.post<UploadedFile>('/uploads', form);
  return data;
}

/** `GET /uploads/{id}` as a Blob (the endpoint needs the bearer token, so `<img src>` can't load it). */
export async function fetchUploadBlob(uploadId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/uploads/${uploadId}`, { responseType: 'blob' });
  return data;
}

/** `DELETE /uploads/{id}` (also unsets it as the business logo). */
export async function deleteUpload(uploadId: number): Promise<void> {
  await api.delete(`/uploads/${uploadId}`);
}
