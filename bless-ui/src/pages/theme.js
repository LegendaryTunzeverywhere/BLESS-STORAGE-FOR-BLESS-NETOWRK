import { extendTheme } from "@chakra-ui/react";

const config = {
  initialColorMode: "light",
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: "#fff9e6",      // Light background
    100: "#fffbf2",
    200: "#ffd700",     // Primary (Gold)
    300: "#daa520",     // Success (GoldenRod)
    400: "#4169e1",     // Secondary (Royal Blue)
    500: "#b8860b",     // Error (Dark GoldenRod)
    600: "#000000",     // Accent (Black)
  },
};

const components = {
  Button: {
    baseStyle: {
      fontWeight: "medium",
      borderRadius: "xl",
    },
    variants: {
      solid: (props) => ({
        bg: props.colorMode === "dark" ? "brand.200" : "brand.200",
        color: "black",
        _hover: {
          bg: "brand.300",
        },
      }),
    },
  },
  Badge: {
    baseStyle: {
      borderRadius: "full",
      px: 2,
      py: 1,
      fontWeight: "semibold",
    },
  },
  Card: {
    baseStyle: {
      borderRadius: "md",
      boxShadow: "md",
      padding: 4,
      bg: "white",
      _dark: {
        bg: "gray.700",
      },
    },
  },
};

const styles = {
  global: (props) => ({
    body: {
      bg: props.colorMode === "dark" ? "gray.800" : "gray.50",
      color: props.colorMode === "dark" ? "gray.100" : "gray.800",
    },
    "*::selection": {
      background: "brand.200",
      color: "black",
    },
  }),
};

const fonts = {
  heading: "'Inter', sans-serif",
  body: "'Inter', sans-serif",
};

const theme = extendTheme({
  config,
  colors,
  styles,
  fonts,
  components,
});

export default theme;