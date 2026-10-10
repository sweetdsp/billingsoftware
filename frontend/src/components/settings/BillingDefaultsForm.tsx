import {
  Badge,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { ChangeEvent } from 'react';
import { useFormContext } from 'react-hook-form';
import { COMMON_CURRENCIES, isCommonCurrency } from '../../lib/currencies';
import {
  BILL_PREFIX_MAX,
  type BusinessProfileFormValues,
  DUE_DAYS_MAX,
  formatBillNumber,
} from './businessProfileSchema';

const OTHER_CURRENCY = '__other__';

export interface BillingDefaultsFormProps {
  /** Show the default tax rate field (hidden in the onboarding wizard). Defaults to true. */
  showTaxRate?: boolean;
  /** Sequence number the next bill will use (read-only on the backend). Defaults to 1. */
  nextBillNumber?: number;
}

/**
 * Billing defaults section: currency, bill number prefix, due days and tax rate.
 * Must be rendered inside a `FormProvider` of `BusinessProfileFormValues`.
 */
export function BillingDefaultsForm({ showTaxRate = true, nextBillNumber = 1 }: BillingDefaultsFormProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<BusinessProfileFormValues>();

  const currency = watch('defaultCurrency');
  const prefix = watch('billNumberPrefix');
  const isOther = !isCommonCurrency(currency);

  const handleCurrencySelect = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value === OTHER_CURRENCY ? '' : event.target.value;
    setValue('defaultCurrency', next, { shouldDirty: true, shouldValidate: next !== '' });
  };

  return (
    <Stack spacing={5}>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        <FormControl isRequired isInvalid={Boolean(errors.defaultCurrency)}>
          <FormLabel htmlFor="currencySelect">Default currency</FormLabel>
          <Select
            id="currencySelect"
            value={isOther ? OTHER_CURRENCY : currency}
            onChange={handleCurrencySelect}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
            <option value={OTHER_CURRENCY}>Other (enter ISO code)</option>
          </Select>
          {isOther && (
            <Input
              mt={2}
              aria-label="Currency code"
              placeholder="e.g. KES"
              maxLength={3}
              textTransform="uppercase"
              {...register('defaultCurrency', {
                setValueAs: (v: string) => v.trim().toUpperCase(),
              })}
            />
          )}
          <FormErrorMessage>{errors.defaultCurrency?.message}</FormErrorMessage>
        </FormControl>

        <FormControl isInvalid={Boolean(errors.billNumberPrefix)}>
          <FormLabel htmlFor="billNumberPrefix">Bill number prefix</FormLabel>
          <Input id="billNumberPrefix" placeholder="BM-" {...register('billNumberPrefix')} />
          {errors.billNumberPrefix ? (
            <FormErrorMessage>{errors.billNumberPrefix.message}</FormErrorMessage>
          ) : (
            <FormHelperText>
              <Text as="span" display="block" mb={1}>
                Up to {BILL_PREFIX_MAX} letters, digits, &apos;-&apos;, &apos;_&apos; or &apos;/&apos;.
              </Text>
              <HStack as="span" spacing={2}>
                <Text as="span">Next bill:</Text>
                <Badge colorScheme="purple" fontFamily="mono" data-testid="next-bill-preview">
                  {formatBillNumber(prefix, nextBillNumber)}
                </Badge>
              </HStack>
            </FormHelperText>
          )}
        </FormControl>

        <FormControl isRequired isInvalid={Boolean(errors.defaultDueDays)}>
          <FormLabel htmlFor="defaultDueDays">Payment due after</FormLabel>
          <InputGroup>
            <Input
              id="defaultDueDays"
              type="number"
              inputMode="numeric"
              min={0}
              max={DUE_DAYS_MAX}
              {...register('defaultDueDays', { valueAsNumber: true })}
            />
            <InputRightAddon>days</InputRightAddon>
          </InputGroup>
          <FormErrorMessage>{errors.defaultDueDays?.message}</FormErrorMessage>
        </FormControl>

        {showTaxRate && (
          <FormControl isInvalid={Boolean(errors.defaultTaxRate)}>
            <FormLabel htmlFor="defaultTaxRate">Default tax rate</FormLabel>
            <InputGroup>
              <Input id="defaultTaxRate" inputMode="decimal" {...register('defaultTaxRate')} />
              <InputRightAddon>%</InputRightAddon>
            </InputGroup>
            <FormErrorMessage>{errors.defaultTaxRate?.message}</FormErrorMessage>
          </FormControl>
        )}
      </SimpleGrid>
    </Stack>
  );
}

export default BillingDefaultsForm;
