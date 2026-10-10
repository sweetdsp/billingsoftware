import {
  Alert,
  AlertDescription,
  AlertIcon,
  Divider,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Link,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { GoogleButton } from '../../components/auth/GoogleButton';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { AutoLoginError } from '../../context/authContextDefinition';
import { useAuth } from '../../hooks/useAuth';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  emailSchema,
  fullNameSchema,
  passwordSchema,
} from '../../lib/validation';
import { getErrorCode, getErrorMessage } from '../../services/api';

const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: PASSWORD_MISMATCH_MESSAGE,
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: RegisterFormValues): Promise<void> => {
    setFormError(null);
    setEmailTaken(false);
    try {
      await registerAccount({
        email: values.email,
        password: values.password,
        fullName: values.fullName || null,
      });
      toast({
        status: 'success',
        title: 'Account created',
        description: 'Check your inbox to verify your email.',
        duration: 6000,
        isClosable: true,
      });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      if (err instanceof AutoLoginError) {
        toast({ status: 'info', title: 'Account created', description: err.message, isClosable: true });
        navigate('/login', { replace: true });
        return;
      }
      if (getErrorCode(err) === 'email_taken') {
        setEmailTaken(true);
        return;
      }
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <PageWrapper title="Create your account" subtitle="Start sending recurring bills in minutes.">
      <GlassCard hoverLift={false}>
        <Stack spacing={5}>
          {emailTaken && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>
                An account with this email already exists.{' '}
                <Link as={RouterLink} to="/login" fontWeight="semibold" textDecoration="underline">
                  Sign in instead
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {formError && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <GoogleButton label="Sign up with Google" />

          <HStack>
            <Divider />
            <Text fontSize="sm" color="text-muted" whiteSpace="nowrap">
              or sign up with email
            </Text>
            <Divider />
          </HStack>

          <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Registration form">
            <Stack spacing={4}>
              <FormControl isInvalid={Boolean(errors.fullName)}>
                <FormLabel>Full name</FormLabel>
                <Input autoComplete="name" {...register('fullName')} />
                <FormErrorMessage>{errors.fullName?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={Boolean(errors.email)}>
                <FormLabel>Email</FormLabel>
                <Input type="email" autoComplete="email" {...register('email')} />
                <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={Boolean(errors.password)}>
                <FormLabel>Password</FormLabel>
                <PasswordInput autoComplete="new-password" {...register('password')} />
                {errors.password ? (
                  <FormErrorMessage>{errors.password.message}</FormErrorMessage>
                ) : (
                  <FormHelperText>At least {PASSWORD_MIN_LENGTH} characters.</FormHelperText>
                )}
              </FormControl>

              <FormControl isInvalid={Boolean(errors.confirmPassword)}>
                <FormLabel>Confirm password</FormLabel>
                <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
                <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
              </FormControl>

              <GradientButton type="submit" isFullWidth isLoading={isSubmitting} loadingText="Creating account…">
                Create account
              </GradientButton>
            </Stack>
          </form>

          <Text fontSize="sm" textAlign="center" color="text-muted">
            Already have an account?{' '}
            <Link as={RouterLink} to="/login" color="brand-fg" fontWeight="semibold">
              Sign in
            </Link>
          </Text>
        </Stack>
      </GlassCard>
    </PageWrapper>
  );
}
