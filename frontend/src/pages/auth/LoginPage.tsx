import {
  Alert,
  AlertDescription,
  AlertIcon,
  Divider,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { GoogleButton } from '../../components/auth/GoogleButton';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { getPostLoginPath } from '../../components/auth/redirect';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useAuth } from '../../hooks/useAuth';
import { emailSchema, existingPasswordSchema } from '../../lib/validation';
import { getErrorCode, getErrorMessage } from '../../services/api';

const loginSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
});

type LoginFormValues = z.infer<typeof loginSchema>;

function loginErrorMessage(err: unknown): string {
  switch (getErrorCode(err)) {
    case 'invalid_credentials':
      return 'Incorrect email or password. Please try again.';
    case 'inactive':
      return 'This account has been deactivated. Please contact support.';
    default:
      return getErrorMessage(err);
  }
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const redirectTo = getPostLoginPath(location.state);
  const oauthFailed = searchParams.get('error') === 'oauth_failed';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(loginErrorMessage(err));
    }
  };

  if (!isLoading && isAuthenticated && !isSubmitting) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <PageWrapper title="Login" subtitle="Welcome back. Sign in to manage your bills.">
      <GlassCard hoverLift={false}>
        <Stack spacing={5}>
          {oauthFailed && !formError && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>Google sign-in failed. Please try again.</AlertDescription>
            </Alert>
          )}
          {formError && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <GoogleButton />

          <HStack>
            <Divider />
            <Text fontSize="sm" color="text-muted" whiteSpace="nowrap">
              or sign in with email
            </Text>
            <Divider />
          </HStack>

          <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Login form">
            <Stack spacing={4}>
              <FormControl isInvalid={Boolean(errors.email)}>
                <FormLabel>Email</FormLabel>
                <Input type="email" autoComplete="email" {...register('email')} />
                <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={Boolean(errors.password)}>
                <Flex justify="space-between" align="baseline">
                  <FormLabel>Password</FormLabel>
                  <Link as={RouterLink} to="/forgot-password" fontSize="sm" color="brand-fg">
                    Forgot password?
                  </Link>
                </Flex>
                <PasswordInput autoComplete="current-password" {...register('password')} />
                <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
              </FormControl>

              <GradientButton type="submit" isFullWidth isLoading={isSubmitting} loadingText="Signing in…">
                Sign in
              </GradientButton>
            </Stack>
          </form>

          <Text fontSize="sm" textAlign="center" color="text-muted">
            New to Bill Maker?{' '}
            <Link as={RouterLink} to="/register" color="brand-fg" fontWeight="semibold">
              Create an account
            </Link>
          </Text>
        </Stack>
      </GlassCard>
    </PageWrapper>
  );
}
