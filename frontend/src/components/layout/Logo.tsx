import { HStack, Link, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

export interface LogoProps {
  /** Where the logo links to. */
  to?: string;
}

export function Logo({ to = '/' }: LogoProps) {
  return (
    <Link as={RouterLink} to={to} _hover={{ textDecoration: 'none' }} aria-label="Bill Maker home">
      <HStack spacing={2}>
        <Text
          as="span"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          w={8}
          h={8}
          borderRadius="lg"
          bgGradient="linear(to-br, brand.500, accent.500)"
          color="white"
          fontWeight="extrabold"
          fontSize="sm"
        >
          BM
        </Text>
        <Text as="span" fontWeight="bold" fontSize="lg" letterSpacing="tight">
          Bill Maker
        </Text>
      </HStack>
    </Link>
  );
}

export default Logo;
