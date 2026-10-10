import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  SimpleGrid,
  Stack,
  Textarea,
} from '@chakra-ui/react';
import { useFormContext } from 'react-hook-form';
import { type BusinessProfileFormValues, FOOTER_NOTE_MAX } from './businessProfileSchema';

export interface BusinessProfileFormProps {
  /** `minimal` shows only the business name (onboarding); `full` shows every business detail. */
  variant?: 'full' | 'minimal';
}

/**
 * Business details section. Must be rendered inside a react-hook-form `FormProvider`
 * whose values are `BusinessProfileFormValues` (validated by `businessProfileSchema`).
 */
export function BusinessProfileForm({ variant = 'full' }: BusinessProfileFormProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<BusinessProfileFormValues>();

  return (
    <Stack spacing={5}>
      <FormControl isRequired isInvalid={Boolean(errors.businessName)}>
        <FormLabel htmlFor="businessName">Business name</FormLabel>
        <Input id="businessName" autoComplete="organization" {...register('businessName')} />
        <FormErrorMessage>{errors.businessName?.message}</FormErrorMessage>
      </FormControl>

      {variant === 'full' && (
        <>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
            <FormControl isInvalid={Boolean(errors.email)}>
              <FormLabel htmlFor="businessEmail">Business email</FormLabel>
              <Input id="businessEmail" type="email" autoComplete="email" {...register('email')} />
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={Boolean(errors.phone)}>
              <FormLabel htmlFor="businessPhone">Phone</FormLabel>
              <Input id="businessPhone" type="tel" autoComplete="tel" {...register('phone')} />
              <FormErrorMessage>{errors.phone?.message}</FormErrorMessage>
            </FormControl>
          </SimpleGrid>

          <FormControl isInvalid={Boolean(errors.address)}>
            <FormLabel htmlFor="businessAddress">Address</FormLabel>
            <Textarea id="businessAddress" rows={3} {...register('address')} />
            <FormErrorMessage>{errors.address?.message}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={Boolean(errors.taxId)}>
            <FormLabel htmlFor="businessTaxId">Tax ID</FormLabel>
            <Input id="businessTaxId" {...register('taxId')} />
            <FormHelperText>Shown on your bills, e.g. GSTIN, VAT or EIN.</FormHelperText>
            <FormErrorMessage>{errors.taxId?.message}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={Boolean(errors.footerNote)}>
            <FormLabel htmlFor="footerNote">Bill footer note</FormLabel>
            <Textarea id="footerNote" rows={3} {...register('footerNote')} />
            <FormHelperText>
              Printed at the bottom of every bill (max {FOOTER_NOTE_MAX} characters).
            </FormHelperText>
            <FormErrorMessage>{errors.footerNote?.message}</FormErrorMessage>
          </FormControl>
        </>
      )}
    </Stack>
  );
}

export default BusinessProfileForm;
