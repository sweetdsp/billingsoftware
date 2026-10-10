import {
  Box,
  Button,
  Center,
  HStack,
  Image,
  Skeleton,
  Stack,
  Text,
  VisuallyHiddenInput,
} from '@chakra-ui/react';
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useAuthedObjectUrl } from '../../hooks/useAuthedObjectUrl';
import { useUploadFile } from '../../hooks/useUploads';
import type { UploadedFile } from '../../types';
import { LOGO_ACCEPT, LOGO_MAX_MB, uploadErrorMessage, validateLogoFile } from './logoValidation';

export interface LogoUploaderProps {
  /** Currently saved logo upload id, or null. */
  logoFileId: number | null;
  /** Called with the new upload; the parent persists it on the business profile. */
  onUploaded: (file: UploadedFile) => Promise<void>;
  /** Called when the user removes the logo. */
  onRemove: () => Promise<void>;
  isDisabled?: boolean;
  /** Parent is persisting a change (save / remove in progress). */
  isBusy?: boolean;
}

/** Drag-and-drop / click logo uploader with client-side checks and an authenticated preview. */
export function LogoUploader({
  logoFileId,
  onUploaded,
  onRemove,
  isDisabled = false,
  isBusy = false,
}: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const upload = useUploadFile();
  const preview = useAuthedObjectUrl(logoFileId);

  const busy = upload.isPending || isBusy;
  const disabled = isDisabled || busy;

  const openPicker = (): void => {
    if (!disabled) inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const clientError = validateLogoFile(file);
    if (clientError) {
      setError(clientError);
      return;
    }
    setError(null);
    let uploaded: UploadedFile;
    try {
      uploaded = await upload.mutateAsync({ file, purpose: 'logo' });
    } catch (err: unknown) {
      setError(uploadErrorMessage(err));
      return;
    }
    try {
      await onUploaded(uploaded);
    } catch {
      setError('The logo was uploaded but could not be saved to your profile. Please try again.');
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still fires `change`.
    event.target.value = '';
    void handleFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    void handleFile(event.dataTransfer.files[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const handleRemove = async (): Promise<void> => {
    setError(null);
    try {
      await onRemove();
    } catch {
      setError('Could not remove the logo. Please try again.');
    }
  };

  return (
    <Stack spacing={4}>
      <HStack spacing={6} align="center" flexWrap="wrap">
        <Center
          boxSize="28"
          borderRadius="xl"
          borderWidth="1px"
          borderColor="border-subtle"
          bg="surface-glass"
          overflow="hidden"
          flexShrink={0}
        >
          {logoFileId !== null && preview.isLoading && <Skeleton boxSize="full" />}
          {logoFileId !== null && preview.url && (
            <Image src={preview.url} alt="Business logo" objectFit="contain" boxSize="full" p={2} />
          )}
          {logoFileId !== null && preview.isError && (
            <Text fontSize="xs" color="text-muted" textAlign="center" px={2}>
              Preview unavailable
            </Text>
          )}
          {logoFileId === null && (
            <Text fontSize="xs" color="text-muted" textAlign="center" px={2}>
              No logo
            </Text>
          )}
        </Center>

        <Box
          flex="1"
          minW="60"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={logoFileId === null ? 'Upload a logo' : 'Replace the logo'}
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          p={6}
          borderWidth="2px"
          borderStyle="dashed"
          borderRadius="xl"
          borderColor={isDragging ? 'brand.400' : 'border-subtle'}
          bg={isDragging ? 'whiteAlpha.100' : 'transparent'}
          cursor={disabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.6 : 1}
          transition="border-color 0.2s, background 0.2s"
          _focusVisible={{ outline: '2px solid', outlineColor: 'brand.300' }}
        >
          <Stack spacing={1} textAlign="center">
            <Text fontWeight="semibold">
              {busy ? 'Uploading…' : 'Drop your logo here or click to browse'}
            </Text>
            <Text fontSize="sm" color="text-muted">
              PNG, JPEG or SVG, up to {LOGO_MAX_MB} MB
            </Text>
          </Stack>
        </Box>
        <VisuallyHiddenInput
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          aria-label="Logo file"
          data-testid="logo-file-input"
          disabled={disabled}
          onChange={handleInputChange}
        />
      </HStack>

      {error && (
        <Text color="red.500" fontSize="sm" role="alert">
          {error}
        </Text>
      )}

      {logoFileId !== null && (
        <HStack spacing={3}>
          <Button size="sm" variant="outline" onClick={openPicker} isDisabled={disabled}>
            Replace
          </Button>
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() => void handleRemove()}
            isDisabled={disabled}
          >
            Remove
          </Button>
        </HStack>
      )}
    </Stack>
  );
}

export default LogoUploader;
