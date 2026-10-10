import { Box, Container, Flex } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { ColorModeToggle } from './ColorModeToggle';
import { Logo } from './Logo';
import { MeshBackground } from './MeshBackground';

/** Layout for login/register/password flows and onboarding: centered content over a mesh background. */
export function AuthLayout() {
  return (
    <Flex minH="100vh" direction="column" position="relative">
      <MeshBackground />
      <Flex as="header" px={{ base: 4, md: 8 }} h={16} align="center" justify="space-between">
        <Logo to="/" />
        <ColorModeToggle />
      </Flex>
      <Flex as="main" flex="1" align="center" justify="center" px={4} py={{ base: 6, md: 12 }}>
        <Container maxW="lg" px={0}>
          <Box w="full">
            <Outlet />
          </Box>
        </Container>
      </Flex>
    </Flex>
  );
}

export default AuthLayout;
