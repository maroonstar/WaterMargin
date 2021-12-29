/* eslint no-use-before-define: "warn" */
const fs = require("fs");
const chalk = require("chalk");
const { config, ethers, tenderly, run,network } = require("hardhat");
const { utils } = require("ethers");
const R = require("ramda");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const addressList = require('./addressList.json');

function hashToken(account) {
  return Buffer.from(ethers.utils.solidityKeccak256(['address'], [account]).slice(2), 'hex')
}


const main = async () => {
  console.log("\n\n 📡 Deploying...\n");

  // read in all the assets to get their IPFS hash...
  let uploadedAssets = JSON.parse(fs.readFileSync("./uploaded.json"))
  let bytes32Array = []
  for(let a in uploadedAssets){
    console.log(" 🏷 IPFS:",a)
    let bytes32 = utils.id(a)
    console.log(" #️⃣ hashed:",bytes32)
    bytes32Array.push(bytes32)
  }
  console.log(" \n")

  // deploy the contract with all the artworks forSale
  const yourCollectible = await deploy("DappLearningCollectible",[]) // <-- add in constructor args like line 19 vvvv
  
  // set MerkleRoot
  let merkleTree = new MerkleTree(addressList.map(token => hashToken(token)), keccak256, { sortPairs: true });
  await yourCollectible.setRoot(merkleTree.getHexRoot());

  // Deploy contract AuctionFixedPrice
  const auctionFixed = await deploy("AuctionFixedPrice",[]) // <-- add in constructor args like line 19 vvvv

  // Deploy contract AuctionUnfixedPrice
  const auctionUnfixed = await deploy("AuctionUnfixedPrice",[]) // <-- add in constructor args like line 19 vvvv

  console.log(
    " 💾  Artifacts (address, abi, and args) saved to: ",
    chalk.blue("packages/hardhat/artifacts/"),
    "\n\n"
  );
};


const deploy = async (contractName, _args = [], overrides = {}, libraries = {}) => {
  console.log(` 🛰  Deploying: ${contractName}`);

  const contractArgs = _args || [];
  const contractArtifacts = await ethers.getContractFactory(contractName,{libraries: libraries});
  const deployed = await contractArtifacts.deploy(...contractArgs, overrides);
  const encoded = abiEncodeArgs(deployed, contractArgs);
  fs.writeFileSync(`artifacts/${contractName}.address`, deployed.address);

  let extraGasInfo = ""
  if(deployed&&deployed.deployTransaction){
    const gasUsed = deployed.deployTransaction.gasLimit.mul(deployed.deployTransaction.gasPrice)
    extraGasInfo = `${utils.formatEther(gasUsed)} ETH, tx hash ${deployed.deployTransaction.hash}`
  }

  console.log(
    " 📄",
    chalk.cyan(contractName),
    "deployed to:",
    chalk.magenta(deployed.address)
  );
  console.log(
    " ⛽",
    chalk.grey(extraGasInfo)
  );

  await tenderly.persistArtifacts({
    name: contractName,
    address: deployed.address
  });

  if (!encoded || encoded.length <= 2) return deployed;
  fs.writeFileSync(`artifacts/${contractName}.args`, encoded.slice(2));

  return deployed;
};


// ------ utils -------

// abi encodes contract arguments
// useful when you want to manually verify the contracts
// for example, on Etherscan
const abiEncodeArgs = (deployed, contractArgs) => {
  // not writing abi encoded args if this does not pass
  if (
    !contractArgs ||
    !deployed ||
    !R.hasPath(["interface", "deploy"], deployed)
  ) {
    return "";
  }
  const encoded = utils.defaultAbiCoder.encode(
    deployed.interface.deploy.inputs,
    contractArgs
  );
  return encoded;
};

// checks if it is a Solidity file
const isSolidity = (fileName) =>
  fileName.indexOf(".sol") >= 0 && fileName.indexOf(".swp") < 0 && fileName.indexOf(".swap") < 0;

const readArgsFile = (contractName) => {
  let args = [];
  try {
    const argsFile = `./contracts/${contractName}.args`;
    if (!fs.existsSync(argsFile)) return args;
    args = JSON.parse(fs.readFileSync(argsFile));
  } catch (e) {
    console.log(e);
  }
  return args;
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// If you want to verify on https://tenderly.co/
const tenderlyVerify = async ({contractName, contractAddress}) => {

  let tenderlyNetworks = ["kovan","goerli","mainnet","rinkeby","ropsten","matic","mumbai","xDai","POA"]
  let targetNetwork = process.env.HARDHAT_NETWORK || config.defaultNetwork

  if(tenderlyNetworks.includes(targetNetwork)) {
    console.log(chalk.blue(` 📁 Attempting tenderly verification of ${contractName} on ${targetNetwork}`))

    await tenderly.persistArtifacts({
      name: contractName,
      address: contractAddress
    });

    let verification = await tenderly.verify({
        name: contractName,
        address: contractAddress,
        network: targetNetwork
      })

    return verification
  } else {
      console.log(chalk.grey(` 🧐 Contract verification not supported on ${targetNetwork}`))
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });