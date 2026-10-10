import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

export const themeConfig: ThemeConfig = {
  initialColorMode: 'system',
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  accent: {
    50: '#fdf2f8',
    100: '#fce7f3',
    200: '#fbcfe8',
    300: '#f9a8d4',
    400: '#f472b6',
    500: '#ec4899',
    600: '#db2777',
    700: '#be185d',
    800: '#9d174d',
    900: '#831843',
  },
};

const fonts = {
  heading: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  body: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  mono: `'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace`,
};

/**
 * Semantic tokens: use these names in components instead of raw palette values so light/dark
 * mode is handled in one place.
 */
const semanticTokens = {
  colors: {
    'surface-canvas': { default: 'gray.50', _dark: 'gray.900' },
    'surface-card': { default: 'white', _dark: 'gray.800' },
    'surface-glass': { default: 'whiteAlpha.800', _dark: 'whiteAlpha.100' },
    'surface-sidebar': { default: 'white', _dark: 'gray.850' },
    'surface-hover': { default: 'gray.100', _dark: 'whiteAlpha.100' },
    'border-subtle': { default: 'blackAlpha.100', _dark: 'whiteAlpha.200' },
    'text-default': { default: 'gray.800', _dark: 'gray.100' },
    'text-muted': { default: 'gray.600', _dark: 'gray.400' },
    'brand-fg': { default: 'brand.600', _dark: 'brand.300' },
    'brand-subtle': { default: 'brand.50', _dark: 'whiteAlpha.100' },
  },
  shadows: {
    card: {
      default: '0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06)',
      _dark: '0 1px 3px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35)',
    },
    'card-hover': {
      default: '0 4px 12px rgba(15, 23, 42, 0.08), 0 16px 40px rgba(99, 102, 241, 0.12)',
      _dark: '0 4px 12px rgba(0, 0, 0, 0.5), 0 16px 40px rgba(99, 102, 241, 0.25)',
    },
  },
};

const theme = extendTheme({
  config: themeConfig,
  colors: {
    ...colors,
    gray: {
      850: '#1a202c',
    },
  },
  fonts,
  semanticTokens,
  radii: {
    card: '1rem',
  },
  styles: {
    global: {
      'html, body': {
        bg: 'surface-canvas',
        color: 'text-default',
      },
    },
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'brand',
      },
    },
    Link: {
      baseStyle: {
        _hover: { textDecoration: 'none' },
      },
    },
    Input: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
    Select: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
    Textarea: {
      defaultProps: {
        focusBorderColor: 'brand.500',
      },
    },
  },
});

export default theme;
