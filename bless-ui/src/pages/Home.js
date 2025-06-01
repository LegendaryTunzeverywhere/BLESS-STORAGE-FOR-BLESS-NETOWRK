// src/pages/Home.js
import {
  Box, Button, Heading, Text, VStack, Flex,
} from "@chakra-ui/react";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <Box
      bgGradient="linear(to-br, blue.500, purple.600)"
      color="white"
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={6}
    >
      <VStack spacing={6} maxW="2xl" textAlign="center">
        <Heading fontSize="5xl" fontWeight="bold">Bless Storage</Heading>
        <Text fontSize="xl">
          Decentralized, secure file storage with AI-powered analysis and voice synthesis.
        </Text>
        <Flex gap={4}>
          <Link to="/explorer"><Button colorScheme="whiteAlpha" size="lg">Explore Files</Button></Link>
          <Link to="/signup"><Button variant="outline" size="lg">Sign Up</Button></Link>
        </Flex>
      </VStack>
    </Box>
  );
};

export default Home;
