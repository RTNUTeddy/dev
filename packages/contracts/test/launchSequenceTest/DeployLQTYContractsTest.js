const deploymentHelper = require("../../utils/deploymentHelpers.js")
const testHelpers = require("../../utils/testHelpers.js")
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol")


const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const assertRevert = th.assertRevert
const toBN = th.toBN

contract('Deploying the LQTY contracts: LCF, CI, LQTYStaking, and GrowthToken ', async accounts => {
  const [liquityAG, A, B] = accounts;

  let LQTYContracts

  oneHundred = toBN(100)
  oneMillion = toBN(1000000)
  digits = toBN(1e18)
  three = toBN(3)
  const expectedCISupplyCap = oneHundred.mul(oneMillion).mul(digits).div(three)

  beforeEach(async () => {
    // Deploy all contracts from the first account
    LQTYContracts = await deploymentHelper.deployLQTYContracts()
    await deploymentHelper.connectLQTYContracts(LQTYContracts)

    lqtyStaking = LQTYContracts.lqtyStaking
    growthToken = LQTYContracts.growthToken
    communityIssuance = LQTYContracts.communityIssuance
    lockupContractFactory = LQTYContracts.lockupContractFactory

    //LQTY Staking and CommunityIssuance have not yet had their setters called, so are not yet
    // connected to the rest of the system
  })

  describe('LockupContractFactory deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await lockupContractFactory.deployer()

      assert.equal(liquityAG, storedDeployerAddress)
    })

    it("Stores the timestamp for the block in which it was deployed", async () => {
      const storedDeploymentTimestamp = await lockupContractFactory.deploymentTime()

      const deploymentTxReceipt = await web3.eth.getTransaction(lockupContractFactory.transactionHash)
      const deploymentBlockTimestamp = await th.getTimestampFromTxReceipt(deploymentTxReceipt, web3)

      assert.equal(storedDeploymentTimestamp, deploymentBlockTimestamp)
    })
  })

  describe('CommunityIssuance deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await communityIssuance.owner()

      assert.equal(liquityAG, storedDeployerAddress)
    })
  })

  describe('LQTYStaking deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await lqtyStaking.owner()

      assert.equal(liquityAG, storedDeployerAddress)
    })
  })

  describe('GrowthToken deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await growthToken.deployer()

      assert.equal(liquityAG, storedDeployerAddress)
    })

    it("Stores the CommunityIssuance address", async () => {
      const storedCIAddress = await growthToken.communityIssuanceAddress()

      assert.equal(communityIssuance.address, storedCIAddress)

    })

    it("Stores the LockupContractFactory address", async () => {
      const storedLCFAddress = await growthToken.lockupContractFactory()

      assert.equal(lockupContractFactory.address, storedLCFAddress)
    })

    it("Mints the correct LQTY amount to the deployer's address: (2/3 * 100million)", async () => {
      const deployerLQTYEntitlement = await growthToken.balanceOf(liquityAG)

      // (2/3 * 100million ), as a uint representation of 18-digit decimal
      const _twentySix_Sixes = "6".repeat(26)

      assert.equal(_twentySix_Sixes, deployerLQTYEntitlement)
    })

    it("Mints the correct LQTY amount to the CommunityIssuance contract address: (1/3 * 100million)", async () => {
      const communityLQTYEntitlement = await growthToken.balanceOf(communityIssuance.address)

      // (1/3 * 100million ), as a uint representation of 18-digit decimal
      const _twentySix_Threes = "3".repeat(26)

      assert.equal(_twentySix_Threes, communityLQTYEntitlement)
    })
  })

  describe('Community Issuance deployment', async accounts => {
    it("Stores the deployer's address", async () => {

      const storedDeployerAddress = await communityIssuance.owner()

      assert.equal(storedDeployerAddress, liquityAG)
    })

    it("Has a supply cap of (1/3) * 100 million", async () => {
      const supplyCap = await communityIssuance.LQTYSupplyCap()

      assert.isTrue(expectedCISupplyCap.eq(supplyCap))
    })

    it("Liquity AG can set addresses if CI's LQTY balance is equal or greater than (1/3) * 100 million ", async () => {
      const LQTYBalance = await growthToken.balanceOf(communityIssuance.address)
      assert.isTrue(LQTYBalance.eq(expectedCISupplyCap))

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployLiquityCore()

      const tx = await communityIssuance.setAddresses(
        growthToken.address,
        coreContracts.stabilityPool.address,
        { from: liquityAG }
      );
      assert.isTrue(tx.receipt.status)
    })

    it("Liquity AG can't set addresses if CI's LQTY balance is < (1/3) * 100 million ", async () => {
      const newCI = await CommunityIssuance.new()

      const LQTYBalance = await growthToken.balanceOf(newCI.address)
      assert.equal(LQTYBalance, '0')

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployLiquityCore()

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await growthToken.transfer(newCI.address, '33333333333333333333333332') // 1e-18 less than the CI expects

      try {
        const tx = await newCI.setAddresses(
          growthToken.address,
          coreContracts.stabilityPool.address,
          { from: liquityAG }
        );
        assert.isFalse(tx.receipt.status)
      
        // Check it gives the expected error message for a failed Solidity 'assert'
      } catch (err) {
        assert.include(err.message, "invalid opcode")
      }
    })
  })

  describe('Connecting GrowthToken to LCF, CI and LQTYStaking', async accounts => {
    it('sets the correct GrowthToken address in LQTYStaking', async () => {
      // Deploy core contracts and set the GrowthToken address in the CI and LQTYStaking
      const coreContracts = await deploymentHelper.deployLiquityCore()
      await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, coreContracts)

      const growthTokenAddress = growthToken.address

      const recordedGrowthTokenAddress = await lqtyStaking.growthToken()
      assert.equal(growthTokenAddress, recordedGrowthTokenAddress)
    })

    it('sets the correct GrowthToken address in LockupContractFactory', async () => {
      const growthTokenAddress = growthToken.address

      const recordedGrowthTokenAddress = await lockupContractFactory.growthToken()
      assert.equal(growthTokenAddress, recordedGrowthTokenAddress)
    })

    it('sets the correct GrowthToken address in CommunityIssuance', async () => {
      // Deploy core contracts and set the GrowthToken address in the CI and LQTYStaking
      const coreContracts = await deploymentHelper.deployLiquityCore()
      await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, coreContracts)

      const growthTokenAddress = growthToken.address

      const recordedGrowthTokenAddress = await communityIssuance.growthToken()
      assert.equal(growthTokenAddress, recordedGrowthTokenAddress)
    })
  })
})