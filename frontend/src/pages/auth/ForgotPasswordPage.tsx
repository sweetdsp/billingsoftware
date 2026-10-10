import {
  Alert,
  AlertDescription,
  AlertIcon,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';
import { z } from 'zod';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { emailSchema } from '../../lib/validation';
import { getErrorMessage } from '../../services/api';
import { forgotPassword } from '../../services/authService';

const forgotSchema = z.object({ email: emailSchema });

type ForgotFormValues = z.infer<typeof forgotSchema>;

/** Same message regardless of whether the account exists (no user enumeration). */
const SUCCESS_MESSAGE =
  'If an account exists for that email, a password reset link has been sent. Check your inbox.';

export default function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotFormValues): Promise<void> => {
    setFormError(null);
    try {
      await forgotPassword({ email: values.email });
      setIsSent(true);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <PageWrapper title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      <GlassCard hoverLift={false}>
        <Stack spacing={5}>
          {isSent ? (
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{SUCCESS_MESSAGE}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Forgot password form">
              <Stack spacing={4}>
                {formError && (
                  <Alert status="error" borderRadius="md">
                    <AlertIcon />
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <FormControl isInvalid={Boolean(errors.email)}>
                  <FormLabel>Email</FormLabel>
                  <Input type="email" autoComplete="email" {...register('email')} />
                  <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
                </FormControl>
                <GradientButton type="submit" isFullWidth isLoading={isSubmitting} loadingText="Sending…">
                  Send reset link
                </GradientButton>
              </Stack>
            </form>
          )}
          <Text fontSize="sm" textAlign="center" color="text-muted">
            Remembered it?{' '}
            <Link as={RouterLink} to="/login" color="brand-fg" fontWeight="semibold">
              Back to sign in
            </Link>
          </Text>
        </Stack>
      </GlassCard>
    </PageWrapper>
  );
}
