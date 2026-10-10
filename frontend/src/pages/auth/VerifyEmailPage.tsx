import { Alert, AlertDescription, AlertIcon, AlertTitle, Stack } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useAuth } from '../../hooks/useAuth';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { verifyEmail } from '../../services/authService';

type VerifyStatus = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser } = useAuth();
  const [status, setStatus] = useState<VerifyStatus>(token ? 'verifying' : 'error');
  const [errorMessage, setErrorMessage] = useState<string>(
    token ? '' : 'This verification link is missing its token. Please use the link from your email.',
  );
  // Tokens are single-use: guard against React StrictMode running the effect twice.
  const hasRequested = useRef<boolean>(false);

  useEffect(() => {
    if (!token || hasRequested.current) return;
    hasRequested.current = true;
    verifyEmail({ token })
      .then(async () => {
        setStatus('success');
        // Update the cached user (isVerified) when signed in on this device.
        await refreshUser();
      })
      .catch((err: unknown) => {
        setErrorMessage(
          getErrorCode(err) === 'invalid_token'
            ? 'This verification link is invalid or has expired.'
            : getErrorMessage(err),
        );
        setStatus('error');
      });
  }, [token, refreshUser]);

  const continuePath = isAuthenticated ? '/dashboard' : '/login';

  return (
    <PageWrapper title="Verify your email">
      <GlassCard hoverLift={false}>
        {status === 'verifying' && <LoadingState label="Verifying your email…" />}
        {status !== 'verifying' && (
          <Stack spacing={5}>
            {status === 'success' ? (
              <Alert status="success" borderRadius="md" flexDirection="column" alignItems="flex-start" gap={1}>
                <AlertIcon />
                <AlertTitle>Email verified</AlertTitle>
                <AlertDescription>Thanks! Your email address has been confirmed.</AlertDescription>
              </Alert>
            ) : (
              <Alert status="error" borderRadius="md" flexDirection="column" alignItems="flex-start" gap={1}>
                <AlertIcon />
                <AlertTitle>Verification failed</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <GradientButton isFullWidth onClick={() => navigate(continuePath, { replace: true })}>
              {isAuthenticated ? 'Continue to dashboard' : 'Continue to sign in'}
            </GradientButton>
          </Stack>
        )}
      </GlassCard>
    </PageWrapper>
  );
}
