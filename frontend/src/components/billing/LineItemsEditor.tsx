import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { estimateTotals } from '../../lib/estimate';
import { formatMoney } from '../../lib/money';
import type { CurrencyCode } from '../../types';
import { TotalsSummary } from './TotalsSummary';
import { EMPTY_LINE_ITEM, LINE_ITEM_LIMITS, type LineItemsFormValues } from './lineItems';

export interface LineItemsEditorProps {
  currency: CurrencyCode;
}

/**
 * Editable list of line items plus a live totals PREVIEW.
 *
 * Must be rendered inside a react-hook-form `FormProvider` whose values include `lineItems` and
 * `taxRate` (see `LineItemsFormValues`). The preview is display-only; the server computes and
 * stores the real amounts.
 */
export function LineItemsEditor({ currency }: LineItemsEditorProps) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<LineItemsFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });
  const items = watch('lineItems');
  const taxRate = watch('taxRate');
  const estimate = estimateTotals(items ?? [], taxRate ?? '0');
  const listError = errors.lineItems?.root?.message ?? errors.lineItems?.message;

  return (
    <Stack spacing={4}>
      {fields.map((field, index) => {
        const rowErrors = errors.lineItems?.[index];
        const amount = estimate.lines[index]?.amount ?? null;
        return (
          <Box
            key={field.id}
            p={4}
            borderWidth="1px"
            borderColor="border-subtle"
            borderRadius="md"
            data-testid="line-item-row"
          >
            <SimpleGrid columns={{ base: 1, md: 12 }} spacing={3} alignItems="start">
              <FormControl gridColumn={{ md: 'span 5' }} isInvalid={Boolean(rowErrors?.description)}>
                <FormLabel fontSize="sm">Description</FormLabel>
                <Input
                  maxLength={LINE_ITEM_LIMITS.description}
                  placeholder="e.g. Monthly retainer"
                  {...register(`lineItems.${index}.description`)}
                />
                <FormErrorMessage>{rowErrors?.description?.message}</FormErrorMessage>
              </FormControl>
              <FormControl gridColumn={{ md: 'span 2' }} isInvalid={Boolean(rowErrors?.quantity)}>
                <FormLabel fontSize="sm">Quantity</FormLabel>
                <Input inputMode="decimal" {...register(`lineItems.${index}.quantity`)} />
                <FormErrorMessage>{rowErrors?.quantity?.message}</FormErrorMessage>
              </FormControl>
              <FormControl gridColumn={{ md: 'span 2' }} isInvalid={Boolean(rowErrors?.unitPrice)}>
                <FormLabel fontSize="sm">Unit price</FormLabel>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  {...register(`lineItems.${index}.unitPrice`)}
                />
                <FormErrorMessage>{rowErrors?.unitPrice?.message}</FormErrorMessage>
              </FormControl>
              <Box gridColumn={{ md: 'span 2' }}>
                <Text fontSize="sm" fontWeight="medium" mb={2}>
                  Amount
                </Text>
                <Text h={10} display="flex" alignItems="center" color="text-muted">
                  {amount === null ? '—' : formatMoney(amount, currency)}
                </Text>
              </Box>
              <Box gridColumn={{ md: 'span 1' }} pt={{ base: 0, md: 8 }}>
                <IconButton
                  aria-label={`Remove line item ${index + 1}`}
                  icon={<Text as="span">✕</Text>}
                  variant="ghost"
                  colorScheme="red"
                  isDisabled={fields.length <= 1}
                  onClick={() => remove(index)}
                />
              </Box>
            </SimpleGrid>
          </Box>
        );
      })}

      {listError && (
        <Text color="red.400" fontSize="sm" role="alert">
          {listError}
        </Text>
      )}

      <Box>
        <Button
          size="sm"
          variant="outline"
          onClick={() => append({ ...EMPTY_LINE_ITEM })}
          isDisabled={fields.length >= LINE_ITEM_LIMITS.maxItems}
        >
          Add line item
        </Button>
      </Box>

      <TotalsSummary
        currency={currency}
        subtotal={estimate.subtotal}
        taxRate={taxRate ?? '0'}
        taxAmount={estimate.taxAmount}
        total={estimate.total}
        note="Estimate only. The server calculates the final amounts when you save."
      />
    </Stack>
  );
}

export default LineItemsEditor;
