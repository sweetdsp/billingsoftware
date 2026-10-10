import { Box, useColorModeValue } from '@chakra-ui/react';

/** Soft gradient mesh used behind auth and public pages. Purely decorative. */
export function MeshBackground() {
  const baseGradient = useColorModeValue(
    'linear(to-br, brand.50, white, accent.50)',
    'linear(to-br, gray.900, gray.800, gray.900)',
  );
  const blobOpacity = useColorModeValue(0.35, 0.2);

  return (
    <Box position="fixed" inset={0} zIndex={-1} overflow="hidden" aria-hidden="true">
      <Box position="absolute" inset={0} bgGradient={baseGradient} />
      <Box
        position="absolute"
        top="-10%"
        left="15%"
        w={{ base: '64', md: '96' }}
        h={{ base: '64', md: '96' }}
        bg="brand.300"
        borderRadius="full"
        filter="blur(80px)"
        opacity={blobOpacity}
      />
      <Box
        position="absolute"
        bottom="-10%"
        right="15%"
        w={{ base: '64', md: '96' }}
        h={{ base: '64', md: '96' }}
        bg="accent.300"
        borderRadius="full"
        filter="blur(80px)"
        opacity={blobOpacity}
      />
    </Box>
  );
}

export default MeshBackground;
