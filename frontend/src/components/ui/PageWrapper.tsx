import { Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { MotionBox } from './motion';

export interface PageWrapperProps {
  children: ReactNode;
  /** Optional page title rendered as the page heading. */
  title?: string;
  /** Optional muted line under the title. */
  subtitle?: string;
  /** Optional actions (buttons) aligned to the right of the title. */
  actions?: ReactNode;
}

/** Every page is wrapped in this: consistent spacing plus a fade/slide-in entrance. */
export function PageWrapper({ children, title, subtitle, actions }: PageWrapperProps) {
  return (
    <MotionBox
      w="full"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
    >
      {(title || actions) && (
        <Flex
          mb={6}
          gap={4}
          align={{ base: 'flex-start', md: 'center' }}
          justify="space-between"
          direction={{ base: 'column', md: 'row' }}
        >
          <Stack spacing={1}>
            {title && (
              <Heading as="h1" size="lg" letterSpacing="tight">
                {title}
              </Heading>
            )}
            {subtitle && <Text color="text-muted">{subtitle}</Text>}
          </Stack>
          {actions && (
            <Flex gap={3} wrap="wrap">
              {actions}
            </Flex>
          )}
        </Flex>
      )}
      {children}
    </MotionBox>
  );
}

export default PageWrapper;
