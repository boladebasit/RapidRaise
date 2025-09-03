# 🚀 RapidRaise: Blockchain Fundraising Platform

Welcome to RapidRaise, a decentralized platform built on the Stacks blockchain that enables rapid fundraising for real-world causes like disaster relief, community projects, or social initiatives. Funds are collected transparently via crypto donations and automatically distributed based on crowd-voted priorities—solving the problems of slow, opaque traditional fundraising and biased fund allocation by empowering donors with democratic decision-making.

## ✨ Features

💸 Quick campaign setup for urgent fundraising needs  
🗳️ Crowd-voting on fund distribution priorities using governance tokens  
🔄 Automatic fund disbursement to approved recipients via smart contracts  
📊 Transparent tracking of donations, votes, and distributions  
🔒 Secure escrow for funds until voting milestones are met  
🚫 Anti-fraud measures like vote weighting and proposal vetting  
🌍 Real-world impact: Integrates with oracles for verifying project outcomes  
✅ Multi-phase campaigns with phased releases based on votes  

## 🛠 How It Works

RapidRaise uses Clarity smart contracts on Stacks to handle everything on-chain, ensuring trustless and efficient operations. The platform involves 8 core smart contracts for modularity and security.

### Key Smart Contracts
1. **CampaignRegistry**: Registers new fundraising campaigns, stores metadata like goal amount, description, and organizer details. Prevents duplicate or spam campaigns.
2. **DonationHandler**: Accepts STX or SIP-10 token donations, tracks total raised, and issues governance tokens to donors proportional to contributions.
3. **GovernanceToken**: A fungible token (FT) contract for voting power. Tokens are minted upon donation and can be staked for boosted influence.
4. **ProposalSubmitter**: Allows verified users to submit proposals for fund usage (e.g., "Allocate 30% to emergency supplies"). Includes basic vetting like minimum token hold.
5. **VotingMechanism**: Handles voting periods, tallies votes on proposals using weighted governance tokens, and enforces rules like quadratic voting to prevent whale dominance.
6. **EscrowVault**: Securely holds campaign funds in escrow until voting concludes, with time-locks for safety.
7. **DistributionExecutor**: Automatically executes fund transfers to winning proposal recipients based on vote outcomes, using multisig-like confirmations.
8. **OutcomeOracle**: Integrates with external oracles (via Clarity traits) to verify real-world milestones (e.g., proof of delivery), triggering final releases or refunds.

**For Fundraisers (Organizers)**  
- Deploy a new campaign via CampaignRegistry with details like target amount and timeline.  
- Promote the campaign off-chain to attract donors.  
- Submit or endorse proposals for how funds should be used.  
- Once voting ends, funds auto-distribute—no manual intervention needed!

**For Donors**  
- Donate STX/tokens to a campaign using DonationHandler—get governance tokens in return.  
- Vote on proposals via VotingMechanism during the active period.  
- Track everything transparently: Use read-only functions to view totals, votes, and distributions.

**For Verifiers/Recipients**  
- Recipients in winning proposals receive funds automatically from DistributionExecutor.  
- Use OutcomeOracle to submit proofs (e.g., receipts) for milestone-based releases.  
- Anyone can query contracts for audit trails—immutable and verifiable on the blockchain.

That's it! RapidRaise turns chaotic fundraising into a streamlined, community-driven process, ensuring funds go where they're needed most without intermediaries. Built with Clarity for clarity (pun intended) and security on Stacks.