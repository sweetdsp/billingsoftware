import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteUpload, uploadFile, type ClientFilePurpose } from '../services/uploadService';
import type { UploadedFile } from '../types';
import { businessProfileKeys } from './useBusinessProfile';

export interface UploadFileVariables {
  file: File;
  purpose: ClientFilePurpose;
}

/** `POST /uploads`. */
export function useUploadFile() {
  return useMutation<UploadedFile, unknown, UploadFileVariables>({
    mutationFn: ({ file, purpose }: UploadFileVariables) => uploadFile(file, purpose),
  });
}

/** `DELETE /uploads/{id}`. Deleting the logo unsets it server-side, so the profile is refetched. */
export function useDeleteUpload() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (uploadId: number) => deleteUpload(uploadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: businessProfileKeys.all });
    },
  });
}
