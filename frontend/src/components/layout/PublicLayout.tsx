import { Container, Flex, Text } from '@chakra-ui/react';
import { Outlet } from 'react-router-dom';
import { MeshBackground } from './MeshBackground';

/** Layout for public, unauthenticated pages such as `/pay/:publicToken`. No app chrome. */
export function PublicLayout() {
  return (
    <Flex minH="100vh" direction="column" position="relative">
      <MeshBackground />
      <Flex as="main" flex="1" justify="center" px={4} py={{ base: 6, md: 12 }}>
        <Container maxW="3xl" px={0}>
          <Outlet />
        </Container>
      </Flex>
      <Flex as="footer" justify="center" py={6}>
        <Text fontSize="sm" color="text-muted">
          Powered by Bill Maker
        </Text>
      </Flex>
    </Flex>
  );
}

export default PublicLayout;
