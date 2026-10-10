import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useAuth } from '../../hooks/useAuth';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  fullNameSchema,
  passwordSchema,
} from '../../lib/validation';
import { getErrorCode, getErrorMessage } from '../../services/api';
import type { User } from '../../types';

// ---------------------------------------------------------------------------
// Profile (name)
// ---------------------------------------------------------------------------

const profileSchema = z.object({ fullName: fullNameSchema });
type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileForm({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user.fullName ?? '' },
  });

  const onSubmit = async (values: ProfileFormValues): Promise<void> => {
    setFormError(null);
    try {
      const updated = await updateProfile({ fullName: values.fullName });
      reset({ fullName: updated.fullName ?? '' });
      toast({ status: 'success', title: 'Profile updated', isClosable: true });
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <GlassCard hoverLift={false} ariaLabel="Profile details">
      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Profile form">
        <Stack spacing={4}>
          <Heading as="h2" size="md">
            Profile
          </Heading>
          {formError && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <FormControl>
            <FormLabel>Email</FormLabel>
            <Input value={user.email} isReadOnly />
          </FormControl>
          <FormControl isInvalid={Boolean(errors.fullName)}>
            <FormLabel>Full name</FormLabel>
            <Input autoComplete="name" {...register('fullName')} />
            <FormErrorMessage>{errors.fullName?.message}</FormErrorMessage>
          </FormControl>
          <Flex justify="flex-end">
            <GradientButton
              type="submit"
              isLoading={isSubmitting}
              isDisabled={!isDirty}
              loadingText="Saving…"
            >
              Save changes
            </GradientButton>
          </Flex>
        </Stack>
      </form>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function buildPasswordSchema(requireCurrent: boolean) {
  return z
    .object({
      currentPassword: requireCurrent
        ? z
            .string()
            .min(1, 'Current password is required')
            .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
        : z.string().max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: PASSWORD_MISMATCH_MESSAGE,
      path: ['confirmPassword'],
    });
}

type PasswordFormValues = z.infer<ReturnType<typeof buildPasswordSchema>>;

function ChangePasswordForm({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  // Google-only accounts have no password yet: they set one without a "current password".
  const isSettingPassword = !user.hasPassword;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(!isSettingPassword)),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values: PasswordFormValues): Promise<void> => {
    setFormError(null);
    try {
      await updateProfile({
        currentPassword: values.currentPassword || undefined,
        newPassword: values.newPassword,
      });
      reset();
      toast({
        status: 'success',
        title: isSettingPassword ? 'Password set' : 'Password changed',
        isClosable: true,
      });
    } catch (err) {
      if (getErrorCode(err) === 'invalid_current_password') {
        setError('currentPassword', {
          type: 'server',
          message: values.currentPassword
            ? 'Current password is incorrect'
            : 'Enter your current password to change it',
        });
        return;
      }
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <GlassCard hoverLift={false} ariaLabel="Password settings">
      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Password form">
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Heading as="h2" size="md">
              {isSettingPassword ? 'Set a password' : 'Change password'}
            </Heading>
            {isSettingPassword && (
              <Text fontSize="sm" color="text-muted">
                You sign in with Google. Set a password to also sign in with your email.
              </Text>
            )}
          </Stack>
          {formError && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {!isSettingPassword && (
            <FormControl isInvalid={Boolean(errors.currentPassword)}>
              <FormLabel>Current password</FormLabel>
              <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
              <FormErrorMessage>{errors.currentPassword?.message}</FormErrorMessage>
            </FormControl>
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
          <Flex justify="flex-end">
            <GradientButton type="submit" isLoading={isSubmitting} loadingText="Saving…">
              {isSettingPassword ? 'Save password' : 'Change password'}
            </GradientButton>
          </Flex>
        </Stack>
      </form>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return <LoadingState label="Loading your profile…" />;
  }

  return (
    <PageWrapper
      title="Profile"
      subtitle="Manage your name and sign-in details."
      actions={
        user.isVerified ? (
          <Badge colorScheme="green" px={3} py={1} borderRadius="full">
            Email verified
          </Badge>
        ) : (
          <Badge colorScheme="orange" px={3} py={1} borderRadius="full">
            Unverified
          </Badge>
        )
      }
    >
      <Stack spacing={6}>
        {!user.isVerified && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <AlertDescription>
              Your email address is not verified yet. Check your inbox for the verification link we
              sent to {user.email}.
            </AlertDescription>
          </Alert>
        )}
        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} alignItems="start">
          <ProfileForm user={user} />
          <ChangePasswordForm user={user} />
        </SimpleGrid>
      </Stack>
    </PageWrapper>
  );
}
