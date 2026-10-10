import {
  Alert,
  AlertDescription,
  AlertIcon,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Link,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { PASSWORD_MIN_LENGTH, PASSWORD_MISMATCH_MESSAGE, passwordSchema } from '../../lib/validation';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { resetPassword } from '../../services/authService';

const resetSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: PASSWORD_MISMATCH_MESSAGE,
    path: ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

function InvalidLink({ message }: { message: string }) {
  return (
    <Stack spacing={4}>
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <Text fontSize="sm" textAlign="center">
        <Link as={RouterLink} to="/forgot-password" color="brand-fg" fontWeight="semibold">
          Request a new reset link
        </Link>
      </Text>
    </Stack>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetFormValues): Promise<void> => {
    if (!token) return;
    setFormError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword });
      toast({
        status: 'success',
        title: 'Password reset',
        description: 'Your password has been updated. Please sign in.',
        isClosable: true,
      });
      navigate('/login', { replace: true });
    } catch (err) {
      if (getErrorCode(err) === 'invalid_token') {
        setTokenInvalid(true);
        return;
      }
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <PageWrapper title="Choose a new password">
      <GlassCard hoverLift={false}>
        {!token ? (
          <InvalidLink message="This reset link is missing its token. Please use the link from your email." />
        ) : tokenInvalid ? (
          <InvalidLink message="This reset link is invalid or has expired." />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Reset password form">
            <Stack spacing={4}>
              {formError && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <FormControl isInvalid={Boolean(errors.newPassword)}>
                <FormLabel>New password</FormLabel>
                <PasswordInput autoComplete="new-password" {...register('newPassword')} />
                {errors.newPassword ? (
                  <FormErrorMessage>{errors.newPassword.message}</FormErrorMessage>
                ) : (
                  <FormHelperText>At least {PASSWORD_MIN_LENGTH} characters.</FormHelperText>
                )}
              </FormControl>
              <FormControl isInvalid={Boolean(errors.confirmPassword)}>
                <FormLabel>Confirm new password</FormLabel>
                <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
                <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
              </FormControl>
              <GradientButton type="submit" isFullWidth isLoading={isSubmitting} loadingText="Saving…">
                Reset password
              </GradientButton>
            </Stack>
          </form>
        )}
      </GlassCard>
    </PageWrapper>
  );
}
