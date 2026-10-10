import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Stack,
} from '@chakra-ui/react';
import { useRef, type ReactNode } from 'react';

export interface ConfirmDialogAlert {
  status: 'error' | 'warning' | 'info';
  title?: string;
  description: ReactNode;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  /** Called on Cancel, Esc and overlay click (ignored while `isLoading`). */
  onClose: () => void;
  /** Called when the confirm button is pressed. The dialog does not close itself. */
  onConfirm: () => void;
  title: string;
  /** Main message explaining the consequences. */
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Color scheme of the confirm button. Defaults to "red" (destructive). */
  confirmColorScheme?: string;
  /** Shows a spinner on the confirm button and blocks closing. */
  isLoading?: boolean;
  /** Optional alert shown under the body, e.g. the server's reason a confirm failed. */
  alert?: ConfirmDialogAlert | null;
  /** Hide the confirm button (e.g. when the action can no longer succeed). */
  hideConfirm?: boolean;
}

/**
 * Accessible confirmation dialog (Chakra AlertDialog) for destructive or important actions.
 * Focus starts on Cancel. The caller owns open state and closes the dialog on success.
 *
 * @example
 * <ConfirmDialog
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   onConfirm={() => archive.mutate(id)}
 *   title="Archive customer?"
 *   body="They will be hidden from your active customers."
 *   confirmLabel="Archive"
 *   isLoading={archive.isPending}
 * />
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColorScheme = 'red',
  isLoading = false,
  alert = null,
  hideConfirm = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const handleClose = () => {
    if (!isLoading) onClose();
  };

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={handleClose}
      isCentered
      motionPreset="slideInBottom"
    >
      <AlertDialogOverlay>
        <AlertDialogContent mx={4} borderRadius="card">
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
          <AlertDialogBody>
            <Stack spacing={4}>
              <Box color="text-muted">{body}</Box>
              {alert && (
                <Alert status={alert.status} borderRadius="md" alignItems="flex-start">
                  <AlertIcon />
                  <Box>
                    {alert.title && <AlertTitle>{alert.title}</AlertTitle>}
                    <AlertDescription display="block">{alert.description}</AlertDescription>
                  </Box>
                </Alert>
              )}
            </Stack>
          </AlertDialogBody>
          <AlertDialogFooter gap={3}>
            <Button ref={cancelRef} variant="ghost" onClick={handleClose} isDisabled={isLoading}>
              {cancelLabel}
            </Button>
            {!hideConfirm && (
              <Button colorScheme={confirmColorScheme} onClick={onConfirm} isLoading={isLoading}>
                {confirmLabel}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

export default ConfirmDialog;
