import { Center, Heading, Stack, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { GradientButton } from '../components/ui/GradientButton';
import { PageWrapper } from '../components/ui/PageWrapper';
import { MeshBackground } from '../components/layout/MeshBackground';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Center minH="100vh" px={4}>
      <MeshBackground />
      <PageWrapper>
        <Stack spacing={4} align="center" textAlign="center">
          <Text
            fontSize="6xl"
            fontWeight="extrabold"
            bgGradient="linear(to-r, brand.500, accent.500)"
            bgClip="text"
          >
            404
          </Text>
          <Heading as="h1" size="lg">
            Page not found
          </Heading>
          <Text color="text-muted">The page you are looking for does not exist or has moved.</Text>
          <GradientButton onClick={() => navigate('/dashboard')}>Go to dashboard</GradientButton>
        </Stack>
      </PageWrapper>
    </Center>
  );
}
