// MainLayout.js with tutorial animation, skip/replay, highlightRefs, and button protection
import {
  Box, Flex, Text, Button, Avatar, useToast, useColorMode, IconButton,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody,
  useDisclosure, useColorModeValue, Tooltip
} from "@chakra-ui/react";
import { SunIcon, MoonIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { Outlet, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { useEffect, useState, useRef, useCallback } from "react";

const tutorialSteps = [
  { title: "👋 Welcome to Bless Storage!", message: "Securely upload, Using AI to analyze, and interact with your files using web3 identity. (No Smart Contract, No Chain)" },
  { title: "🔐 Connect Your Wallet", message: "Click 'Connect Wallet' to authenticate securely using EVM Wallets." },
  { title: "📤 Upload Files", message: "Drag & drop files (1 at a time) or use the upload button. We'll store them on IPFS." },
  { title: "🧠 Analyze Content", message: "Use AI to generate summaries and save insights to IPFS." },
  { title: "🎧 Audio Playback", message: "Generate audio summaries and listen in multiple languages." },
  { title: "🌗 Dark Mode", message: "Toggle light/dark mode to suit your environment." },
];

export default function MainLayout() {
  const toast = useToast();
  const navigate = useNavigate();
  const { colorMode, toggleColorMode } = useColorMode();

  const [account, setAccount] = useState(localStorage.getItem("wallet") || null);
  const [signer, setSigner] = useState(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(localStorage.getItem("tutorialDismissed") === "true");
  const [isWalletReady, setIsWalletReady] = useState(false); // New state

  const highlightRefs = useRef({ upload: null, analyze: null, audio: null });

  useEffect(() => {
    if (!tutorialDismissed) onOpen();
  }, [onOpen, tutorialDismissed]);


  const connectWallet = useCallback(async (silent = false) => {
    if (!window.ethereum || isConnecting) return;
    setIsConnecting(true);
    let addr = null;
    let _signer = null;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      if (silent && localStorage.getItem("wallet") && window.ethereum.selectedAddress === localStorage.getItem("wallet")) {
        // Attempt to get signer silently if already connected and account matches
        try {
          _signer = await provider.getSigner();
          addr = await _signer.getAddress();
        } catch (silentErr) {
          console.warn("Silent signer retrieval failed, attempting full connection:", silentErr);
          // Fallback to full connection if silent fails
          const accounts = await provider.send("eth_requestAccounts", []);
          addr = accounts[0];
          _signer = await provider.getSigner();
        }
      } else {
        // Full connection: prompts user
        const accounts = await provider.send("eth_requestAccounts", []);
        addr = accounts[0];
        _signer = await provider.getSigner();
      }

      if (addr && _signer) {
        const signature = await _signer.signMessage("login");
        localStorage.setItem("wallet", addr);
        localStorage.setItem("auth_signature", signature);
        setAccount(addr);
        setSigner(_signer);
        setIsWalletReady(true); // Set wallet ready after successful connection and signature
        toast({ title: "Wallet connected", status: "success" });
      } else {
        throw new Error("Failed to retrieve account or signer.");
      }
    } catch (err) {
      toast({ title: "Wallet connection failed", description: err.message, status: "error" });
      setAccount(null); // Clear account on failure
      setSigner(null); // Clear signer on failure
      setIsWalletReady(false); // Reset wallet ready state on failure
      localStorage.removeItem("wallet");
      localStorage.removeItem("auth_signature");
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, toast]);

  // New useEffect to re-establish signer on refresh if account is cached
  useEffect(() => {
    const storedAccount = localStorage.getItem("wallet");
    if (storedAccount && !signer && !isConnecting) {
      // Attempt silent connection on refresh
      connectWallet(true); 
    }
  }, [connectWallet, signer, isConnecting]);

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(prev => prev + 1);
    } else {
      localStorage.setItem("tutorialDismissed", "true");
      setTutorialDismissed(true);
      onClose();
    }
  };

  const handlePreviousStep = () => {
    if (tutorialStep > 0) {
      setTutorialStep(prev => prev - 1);
    }
  };

  const handleSkipTutorial = () => {
    localStorage.setItem("tutorialDismissed", "true");
    setTutorialDismissed(true);
    onClose();
  };

  const handleReplayTutorial = () => {
    if (isReplaying) return;
    setIsReplaying(true);
    setTutorialStep(0);
    localStorage.removeItem("tutorialDismissed");
    setTutorialDismissed(false); // Update state
    onOpen();
    setTimeout(() => setIsReplaying(false), 1000);
  };

  const disconnectWallet = () => {
    ["wallet", "auth_signature"].forEach(k => localStorage.removeItem(k));
    setAccount(null);
    setSigner(null);
    setIsWalletReady(false); // Reset wallet ready state on disconnect
    toast({ title: "Disconnected" });
    navigate("/");
  };

  const { title, message } = tutorialSteps[tutorialStep];

  return (
    <Box minH="100vh" pb="60px"> {/* Added padding-bottom to account for fixed footer */}
      <Flex justify="space-between" align="center" p={4} borderBottom="1px solid" borderColor={useColorModeValue("gray.300", "gray.600")} bg={useColorModeValue("gray.50", "gray.800")}>        
        <Text fontSize="xl" fontWeight="bold">Bless Storage</Text>
        <Flex align="center" gap={3}>
          <Tooltip label="Toggle dark/light mode">
            <IconButton icon={colorMode === "dark" ? <SunIcon /> : <MoonIcon />} onClick={toggleColorMode} variant="ghost" aria-label="Toggle color mode" />
          </Tooltip>
          {!account ? (
            <Button onClick={() => connectWallet(false)} colorScheme="teal" size="sm" isLoading={isConnecting} isDisabled={isConnecting}>Connect Wallet</Button>
          ) : (
            <Flex align="center" gap={3}>
              <Avatar size="sm" />
              <Text fontSize="sm">{account.slice(0, 6)}...{account.slice(-4)}</Text>
              <Button size="sm" onClick={disconnectWallet} colorScheme="red">Disconnect</Button>
            </Flex>
          )}
          <Tooltip label="Replay tutorial">
            <IconButton icon={<InfoOutlineIcon />} onClick={handleReplayTutorial} size="sm" variant="ghost" aria-label="Replay tutorial" isDisabled={isReplaying} isLoading={isReplaying} />
          </Tooltip>
        </Flex>
      </Flex>

      {/* Tutorial modal */}
      <Modal isOpen={isOpen} onClose={handleNextStep} isCentered motionPreset="scale">
        <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(10px)" />
        <ModalContent bg={useColorModeValue("white", "gray.700")}
          borderRadius="xl" px={6} boxShadow="2xl" textAlign="center">
          <ModalHeader>{title}</ModalHeader>
          <ModalBody><Text>{message}</Text></ModalBody>
          <ModalFooter justifyContent="space-between">
            {tutorialStep > 0 && (
              <Button onClick={handlePreviousStep} variant="ghost">Back</Button>
            )}
            <Button onClick={handleSkipTutorial} variant="ghost">Skip</Button>
            <Button onClick={handleNextStep} colorScheme="blue">
              {tutorialStep === tutorialSteps.length - 1 ? "Finish" : "Next"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Outlet context={{ account, signer, isWalletReady, tutorialStep, highlightRefs: highlightRefs.current, connectWallet, disconnectWallet, tutorialDismissed }} />

      <Box as="footer" p={4} position="fixed" bottom="0" left="0" right="0" zIndex="999" textAlign="center" borderTop="1px solid" borderColor={useColorModeValue("gray.300", "gray.600")} bg={useColorModeValue("gray.50", "gray.800")}>
        <Text fontSize="sm" color="gray.500">
          Built with 💛 on <a href="https://bless.network/" target="_blank" rel="noopener noreferrer" style={{ color: 'yellow' }}>Bless Network</a>
        </Text>
      </Box>
    </Box>
  );
}
