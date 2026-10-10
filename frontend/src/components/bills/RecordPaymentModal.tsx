import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Textarea,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toHundredths } from '../../lib/estimate';
import { todayISODate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { PAYMENT_ERROR_CODES } from '../../services/paymentService';
import type { CurrencyCode, ManualPaymentCreate, Money, PaymentMethod } from '../../types';
import { PAYMENT_METHOD_LABELS } from '../customers/customerFormat';
import { GradientButton } from '../ui/GradientButton';

/** `online` is recorded automatically by the payment provider and is not allowed here. */
const MANUAL_METHODS = ['bank_transfer', 'cash', 'cheque', 'other'] as const satisfies readonly PaymentMethod[];

const NOTES_MAX = 500;

function schemaFor(balanceDue: Money) {
  const balance = toHundredths(balanceDue) ?? 0;
  return z.object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount with at most 2 decimals')
      .refine((value) => (toHundredths(value) ?? 0) > 0, 'Must be greater than 0')
      .refine(
        (value) => (toHundredths(value) ?? 0) <= balance,
        'Cannot be more than the balance due',
      ),
    method: z.enum(MANUAL_METHODS),
    paidOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
      .refine((value) => value <= todayISODate(), 'Cannot be in the future'),
    notes: z.string().trim().max(NOTES_MAX, `At most ${NOTES_MAX} characters`),
  });
}

type PaymentFormValues = z.infer<ReturnType<typeof schemaFor>>;

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: CurrencyCode;
  balanceDue: Money;
  /** Persist the payment; reject with the API error to have it shown in the form. */
  onSubmit: (payload: ManualPaymentCreate) => Promise<unknown>;
}

/** Record a cash / bank transfer / cheque payment against a bill (never more than is owed). */
export function RecordPaymentModal({
  isOpen,
  onClose,
  currency,
  balanceDue,
  onSubmit,
}: RecordPaymentModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(schemaFor(balanceDue)),
    defaultValues: { amount: balanceDue, method: 'bank_transfer', paidOn: todayISODate(), notes: '' },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ amount: balanceDue, method: 'bank_transfer', paidOn: todayISODate(), notes: '' });
    }
  }, [isOpen, balanceDue, reset]);

  const submit = async (values: PaymentFormValues) => {
    const payload: ManualPaymentCreate = {
      amount: values.amount.trim(),
      method: values.method,
      notes: values.notes.trim() || null,
    };
    // Today's payment is stamped by the server (a client-side time could be "in the future").
    if (values.paidOn !== todayISODate()) payload.paidAt = `${values.paidOn}T12:00:00Z`;
    try {
      await onSubmit(payload);
    } catch (err) {
      const message =
        getErrorCode(err) === PAYMENT_ERROR_CODES.overpayment
          ? 'That is more than the balance due.'
          : getErrorMessage(err);
      setError('root.server', { type: 'server', message });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" mx={4} onSubmit={handleSubmit(submit)} noValidate>
        <ModalHeader>Record a payment</ModalHeader>
        <ModalCloseButton isDisabled={isSubmitting} />
        <ModalBody>
          <Stack spacing={4}>
            {errors.root?.server?.message && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <AlertDescription>{errors.root.server.message}</AlertDescription>
              </Alert>
            )}
            <FormControl isRequired isInvalid={Boolean(errors.amount)}>
              <FormLabel htmlFor="payment-amount">Amount ({currency})</FormLabel>
              <Input id="payment-amount" inputMode="decimal" {...register('amount')} />
              <FormHelperText>Balance due: {formatMoney(balanceDue, currency)}</FormHelperText>
              <FormErrorMessage>{errors.amount?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isRequired isInvalid={Boolean(errors.method)}>
              <FormLabel htmlFor="payment-method">Method</FormLabel>
              <Select id="payment-method" {...register('method')}>
                {MANUAL_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired isInvalid={Boolean(errors.paidOn)}>
              <FormLabel htmlFor="payment-date">Date received</FormLabel>
              <Input id="payment-date" type="date" max={todayISODate()} {...register('paidOn')} />
              <FormErrorMessage>{errors.paidOn?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={Boolean(errors.notes)}>
              <FormLabel htmlFor="payment-notes">Notes (optional)</FormLabel>
              <Textarea id="payment-notes" rows={2} maxLength={NOTES_MAX} {...register('notes')} />
              <FormErrorMessage>{errors.notes?.message}</FormErrorMessage>
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <GradientButton type="submit" isLoading={isSubmitting} loadingText="Saving…">
            Record payment
          </GradientButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default RecordPaymentModal;
