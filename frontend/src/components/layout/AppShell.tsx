import {
  Avatar,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  Link,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Stack,
  Text,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { NavLink, Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../services/api';
import { ChevronDownIcon, MenuIcon } from '../ui/icons';
import { ColorModeToggle } from './ColorModeToggle';
import { Logo } from './Logo';

interface NavItem {
  label: string;
  to: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Customers', to: '/customers' },
  { label: 'Plans', to: '/plans' },
  { label: 'Bills', to: '/bills' },
  { label: 'Payments', to: '/payments' },
  { label: 'Settings', to: '/settings' },
  { label: 'Admin', to: '/admin', adminOnly: true },
];

const SIDEBAR_WIDTH = '64';

interface SidebarNavProps {
  isAdmin: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ isAdmin, onNavigate }: SidebarNavProps) {
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  return (
    <Stack as="nav" spacing={1} aria-label="Main navigation">
      {items.map((item) => (
        <Link
          key={item.to}
          as={NavLink}
          to={item.to}
          onClick={onNavigate}
          px={3}
          py={2}
          borderRadius="lg"
          fontWeight="medium"
          color="text-muted"
          transition="background 0.15s, color 0.15s"
          _hover={{ bg: 'surface-hover', color: 'text-default', textDecoration: 'none' }}
          _activeLink={{ bg: 'brand-subtle', color: 'brand-fg', fontWeight: 'semibold' }}
        >
          {item.label}
        </Link>
      ))}
    </Stack>
  );
}

/** Authenticated application chrome: sidebar (drawer on mobile), top bar and routed content. */
export function AppShell() {
  const { user, logout } = useAuth();
  const drawer = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = user?.isAdmin ?? false;
  const displayName = user?.fullName || user?.email || 'Account';

  const { onClose: closeDrawer } = drawer;
  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    closeDrawer();
  }, [location.pathname, closeDrawer]);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      toast({ status: 'error', title: 'Logout failed', description: getErrorMessage(err) });
    }
  };

  return (
    <Flex minH="100vh" bg="surface-canvas">
      {/* Desktop sidebar */}
      <Box
        as="aside"
        display={{ base: 'none', lg: 'flex' }}
        flexDirection="column"
        w={SIDEBAR_WIDTH}
        flexShrink={0}
        position="sticky"
        top={0}
        h="100vh"
        px={4}
        py={6}
        bg="surface-card"
        borderRightWidth="1px"
        borderColor="border-subtle"
      >
        <Box px={3} mb={8}>
          <Logo to="/dashboard" />
        </Box>
        <SidebarNav isAdmin={isAdmin} />
      </Box>

      {/* Mobile drawer */}
      <Drawer isOpen={drawer.isOpen} placement="left" onClose={drawer.onClose}>
        <DrawerOverlay />
        <DrawerContent bg="surface-card">
          <DrawerCloseButton />
          <DrawerHeader>
            <Logo to="/dashboard" />
          </DrawerHeader>
          <DrawerBody>
            <SidebarNav isAdmin={isAdmin} onNavigate={drawer.onClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Flex direction="column" flex="1" minW={0}>
        {/* Top bar */}
        <Flex
          as="header"
          position="sticky"
          top={0}
          zIndex="sticky"
          h={16}
          px={{ base: 4, md: 8 }}
          align="center"
          justify="space-between"
          bg="surface-glass"
          backdropFilter="blur(12px)"
          borderBottomWidth="1px"
          borderColor="border-subtle"
        >
          <HStack spacing={3}>
            <IconButton
              display={{ base: 'inline-flex', lg: 'none' }}
              aria-label="Open navigation"
              icon={<MenuIcon />}
              variant="ghost"
              colorScheme="gray"
              onClick={drawer.onOpen}
            />
            <Box display={{ base: 'block', lg: 'none' }}>
              <Logo to="/dashboard" />
            </Box>
          </HStack>

          <HStack spacing={2}>
            <ColorModeToggle />
            <Menu placement="bottom-end">
              <MenuButton
                as={Button}
                variant="ghost"
                colorScheme="gray"
                rightIcon={<ChevronDownIcon />}
                px={2}
              >
                <HStack spacing={2}>
                  <Avatar size="sm" name={displayName} bg="brand.500" color="white" />
                  <Text display={{ base: 'none', md: 'block' }} fontSize="sm" fontWeight="medium">
                    {displayName}
                  </Text>
                </HStack>
              </MenuButton>
              <MenuList>
                <MenuItem as={RouterLink} to="/profile">
                  Profile
                </MenuItem>
                <MenuItem as={RouterLink} to="/settings">
                  Business settings
                </MenuItem>
                {isAdmin && (
                  <MenuItem as={RouterLink} to="/admin">
                    Admin panel
                  </MenuItem>
                )}
                <MenuDivider />
                <MenuItem onClick={() => void handleLogout()}>Log out</MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>

        {/* Routed page content */}
        <Box as="main" flex="1" px={{ base: 4, md: 8 }} py={{ base: 6, md: 8 }} maxW="7xl" w="full" mx="auto">
          <Outlet />
        </Box>
      </Flex>
    </Flex>
  );
}

export default AppShell;
