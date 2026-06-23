// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MerchantVault} from "../contracts/MerchantVault.sol";
import {AgenticCommerce} from "../contracts/AgenticCommerce.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

contract DeployScript is Script {
    function run() external {
        // Retrieve private key or use Foundry default anvil private key
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address agent = vm.envOr("AGENT_ADDRESS", address(0x2));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));

        console2.log("Deploying from:", vm.addr(deployerPrivateKey));
        console2.log("Agent Address:", agent);

        vm.startBroadcast(deployerPrivateKey);

        // If no USDC address is provided, deploy a mock one
        if (usdcAddress == address(0)) {
            MockERC20 mockUsdc = new MockERC20("USD Coin Mock", "mUSDC");
            usdcAddress = address(mockUsdc);
            console2.log("Deployed Mock USDC at:", usdcAddress);
            
            // Mint some to deployer and agent for testing
            mockUsdc.mint(vm.addr(deployerPrivateKey), 10_000 * 1e6);
            mockUsdc.mint(agent, 10_000 * 1e6);
        } else {
            console2.log("Using existing USDC at:", usdcAddress);
        }

        // Deploy MerchantVault
        MerchantVault vault = new MerchantVault(usdcAddress, agent);
        console2.log("Deployed MerchantVault at:", address(vault));

        // Deploy AgenticCommerce
        AgenticCommerce commerce = new AgenticCommerce(agent);
        console2.log("Deployed AgenticCommerce at:", address(commerce));

        vm.stopBroadcast();
    }
}
