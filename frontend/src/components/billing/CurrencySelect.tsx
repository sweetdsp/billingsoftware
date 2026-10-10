import { FormControl, FormErrorMessage, FormLabel, Select } from '@chakra-ui/react';
import { useFormContext } from 'react-hook-form';
import { COMMON_CURRENCIES, isCommonCurrency } from '../../lib/currencies';

export interface CurrencySelectFormValues {
  currency: string;
}

export interface CurrencySelectProps {
  isDisabled?: boolean;
}

/** Currency dropdown (common ISO-4217 codes; keeps an existing uncommon code selectable). */
export function CurrencySelect({ isDisabled = false }: CurrencySelectProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<CurrencySelectFormValues>();
  const current = watch('currency');
  const uncommon = current && !isCommonCurrency(current) ? current : null;

  return (
    <FormControl isRequired isInvalid={Boolean(errors.currency)} isDisabled={isDisabled}>
      <FormLabel htmlFor="currency">Currency</FormLabel>
      <Select id="currency" {...register('currency')}>
        {uncommon && <option value={uncommon}>{uncommon}</option>}
        {COMMON_CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} — {currency.label}
          </option>
        ))}
      </Select>
      <FormErrorMessage>{errors.currency?.message}</FormErrorMessage>
    </FormControl>
  );
}

export default CurrencySelect;
