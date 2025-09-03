import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Campaign {
  organizer: string;
  totalGovernanceTokens: number;
  proposalCount: number;
  votingPeriod: number;
  active: boolean;
}

interface Proposal {
  submitter: string;
  description: string;
  allocationPercentage: number;
  recipient: string;
  totalVotes: number;
  quadraticTotal: number;
  submissionBlock: number;
  expired: boolean;
}

interface Vote {
  weight: number;
  quadraticWeight: number;
  delegated: boolean;
}

interface Delegation {
  delegatee: string;
}

interface VoterAllowance {
  remainingTokens: number;
}

interface WinningProposal {
  maxVotes: number;
  winningId: number;
}

interface ContractState {
  votingActive: boolean;
  votingPaused: boolean;
  quadraticVotingEnabled: boolean;
  currentCampaignId: number;
  votingStartBlock: number;
  votingEndBlock: number;
  campaigns: Map<number, Campaign>;
  proposals: Map<string, Proposal>; // Key: `${campaignId}-${proposalId}`
  votes: Map<string, Vote>; // Key: `${campaignId}-${proposalId}-${voter}`
  delegations: Map<string, Delegation>; // Key: `${campaignId}-${delegator}`
  voterAllowances: Map<string, VoterAllowance>; // Key: `${campaignId}-${voter}`
  blockHeight: number; // Mock block height
}

// Mock contract implementation
class VotingMechanismMock {
  private state: ContractState = {
    votingActive: false,
    votingPaused: false,
    quadraticVotingEnabled: true,
    currentCampaignId: 0,
    votingStartBlock: 0,
    votingEndBlock: 0,
    campaigns: new Map(),
    proposals: new Map(),
    votes: new Map(),
    delegations: new Map(),
    voterAllowances: new Map(),
    blockHeight: 1000, // Starting mock block height
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_VOTING_NOT_ACTIVE = 101;
  private ERR_VOTING_ENDED = 102;
  private ERR_INVALID_PROPOSAL = 103;
  private ERR_INSUFFICIENT_TOKENS = 104;
  private ERR_ALREADY_VOTED = 105;
  private ERR_INVALID_WEIGHT = 106;
  private ERR_DELEGATION_EXISTS = 107;
  private ERR_NOT_DELEGATED = 108;
  private ERR_PROPOSAL_EXPIRED = 109;
  private ERR_INVALID_CAMPAIGN = 110;
  private ERR_QUADRATIC_VOTING_NOT_ENABLED = 111;
  private ERR_VOTE_EXCEEDS_ALLOWANCE = 112;
  private ERR_TALLY_NOT_READY = 113;
  private ERR_PROPOSAL_NOT_FOUND = 114;
  private ERR_DELEGATE_SELF = 115;
  private ERR_VOTING_PAUSED = 116;
  private MAX_PROPOSAL_LENGTH = 500;
  private MIN_VOTING_PERIOD = 144;
  private MAX_VOTING_PERIOD = 1440;

  // Helper to advance block height
  advanceBlock(blocks: number) {
    this.state.blockHeight += blocks;
  }

  // Mock governance balance (fixed for testing)
  private getGovernanceBalance(voter: string, campaignId: number): ClarityResponse<number> {
    return { ok: true, value: 1000 }; // Fixed balance for simplicity
  }

  initializeCampaign(caller: string, campaignId: number, votingPeriod: number, organizer: string): ClarityResponse<boolean> {
    if (caller !== organizer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (votingPeriod < this.MIN_VOTING_PERIOD || votingPeriod > this.MAX_VOTING_PERIOD) {
      return { ok: false, value: this.ERR_INVALID_WEIGHT };
    }
    if (this.state.campaigns.has(campaignId)) {
      return { ok: false, value: this.ERR_ALREADY_VOTED }; // Reusing error
    }
    this.state.campaigns.set(campaignId, {
      organizer,
      totalGovernanceTokens: 0,
      proposalCount: 0,
      votingPeriod,
      active: true,
    });
    this.state.currentCampaignId = campaignId;
    return { ok: true, value: true };
  }

  startVoting(caller: string, campaignId: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) {
      return { ok: false, value: this.ERR_INVALID_CAMPAIGN };
    }
    if (caller !== campaign.organizer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE }; // Inverted logic in err msg, but as per contract
    }
    if (!campaign.active) {
      return { ok: false, value: this.ERR_VOTING_ENDED };
    }
    this.state.votingActive = true;
    this.state.votingStartBlock = this.state.blockHeight;
    this.state.votingEndBlock = this.state.blockHeight + campaign.votingPeriod;
    return { ok: true, value: true };
  }

  pauseVoting(caller: string, campaignId: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign || caller !== campaign.organizer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    this.state.votingPaused = true;
    return { ok: true, value: true };
  }

  unpauseVoting(caller: string, campaignId: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign || caller !== campaign.organizer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    this.state.votingPaused = false;
    return { ok: true, value: true };
  }

  endVoting(caller: string, campaignId: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) {
      return { ok: false, value: this.ERR_INVALID_CAMPAIGN };
    }
    const isOrganizer = caller === campaign.organizer;
    const isEnded = this.state.blockHeight > this.state.votingEndBlock;
    if (!isOrganizer && !isEnded) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    this.state.votingActive = false;
    campaign.active = false;
    return { ok: true, value: true };
  }

  submitProposal(caller: string, campaignId: number, description: string, allocationPercentage: number, recipient: string): ClarityResponse<number> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) {
      return { ok: false, value: this.ERR_INVALID_CAMPAIGN };
    }
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    if (this.state.votingPaused) {
      return { ok: false, value: this.ERR_VOTING_PAUSED };
    }
    if (description.length > this.MAX_PROPOSAL_LENGTH) {
      return { ok: false, value: this.ERR_INVALID_PROPOSAL };
    }
    if (allocationPercentage <= 0 || allocationPercentage > 100) {
      return { ok: false, value: this.ERR_INVALID_WEIGHT };
    }
    const proposalId = campaign.proposalCount + 1;
    const key = `${campaignId}-${proposalId}`;
    this.state.proposals.set(key, {
      submitter: caller,
      description,
      allocationPercentage,
      recipient,
      totalVotes: 0,
      quadraticTotal: 0,
      submissionBlock: this.state.blockHeight,
      expired: false,
    });
    campaign.proposalCount = proposalId;
    return { ok: true, value: proposalId };
  }

  vote(caller: string, campaignId: number, proposalId: number, weight: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) {
      return { ok: false, value: this.ERR_INVALID_CAMPAIGN };
    }
    const propKey = `${campaignId}-${proposalId}`;
    const proposal = this.state.proposals.get(propKey);
    if (!proposal) {
      return { ok: false, value: this.ERR_INVALID_PROPOSAL };
    }
    const balanceResp = this.getGovernanceBalance(caller, campaignId);
    if (!balanceResp.ok) {
      return balanceResp;
    }
    const balance = balanceResp.value as number;
    const allowanceKey = `${campaignId}-${caller}`;
    const allowance = this.state.voterAllowances.get(allowanceKey)?.remainingTokens ?? balance;
    const qWeight = this.state.quadraticVotingEnabled ? weight ** 2 : weight;
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    if (this.state.votingPaused) {
      return { ok: false, value: this.ERR_VOTING_PAUSED };
    }
    if (this.state.blockHeight >= this.state.votingEndBlock) {
      return { ok: false, value: this.ERR_VOTING_ENDED };
    }
    if (proposal.expired) {
      return { ok: false, value: this.ERR_PROPOSAL_EXPIRED };
    }
    const voteKey = `${campaignId}-${proposalId}-${caller}`;
    if (this.state.votes.has(voteKey)) {
      return { ok: false, value: this.ERR_ALREADY_VOTED };
    }
    if (weight <= 0) {
      return { ok: false, value: this.ERR_INVALID_WEIGHT };
    }
    if (weight > allowance) {
      return { ok: false, value: this.ERR_VOTE_EXCEEDS_ALLOWANCE };
    }
    if (this.state.quadraticVotingEnabled) {
      // Enabled
    } else if (this.state.quadraticVotingEnabled) { // Redundant for type
      return { ok: false, value: this.ERR_QUADRATIC_VOTING_NOT_ENABLED };
    }
    this.state.votes.set(voteKey, { weight, quadraticWeight: qWeight, delegated: false });
    proposal.totalVotes += weight;
    proposal.quadraticTotal += qWeight;
    this.state.voterAllowances.set(allowanceKey, { remainingTokens: allowance - weight });
    return { ok: true, value: true };
  }

  delegateVote(caller: string, campaignId: number, delegatee: string): ClarityResponse<boolean> {
    const balanceResp = this.getGovernanceBalance(caller, campaignId);
    if (!balanceResp.ok) {
      return balanceResp;
    }
    const balance = balanceResp.value as number;
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    if (this.state.votingPaused) {
      return { ok: false, value: this.ERR_VOTING_PAUSED };
    }
    if (caller === delegatee) {
      return { ok: false, value: this.ERR_DELEGATE_SELF };
    }
    const delKey = `${campaignId}-${caller}`;
    if (this.state.delegations.has(delKey)) {
      return { ok: false, value: this.ERR_DELEGATION_EXISTS };
    }
    if (balance <= 0) {
      return { ok: false, value: this.ERR_INSUFFICIENT_TOKENS };
    }
    this.state.delegations.set(delKey, { delegatee });
    // Mock transfer
    return { ok: true, value: true };
  }

  revokeDelegation(caller: string, campaignId: number): ClarityResponse<boolean> {
    if (!this.state.votingActive) {
      return { ok: false, value: this.ERR_VOTING_NOT_ACTIVE };
    }
    const delKey = `${campaignId}-${caller}`;
    const delegation = this.state.delegations.get(delKey);
    if (!delegation) {
      return { ok: false, value: this.ERR_NOT_DELEGATED };
    }
    this.state.delegations.delete(delKey);
    // Mock transfer back
    return { ok: true, value: true };
  }

  expireProposal(caller: string, campaignId: number, proposalId: number): ClarityResponse<boolean> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign || caller !== campaign.organizer) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    const propKey = `${campaignId}-${proposalId}`;
    const proposal = this.state.proposals.get(propKey);
    if (!proposal) {
      return { ok: false, value: this.ERR_PROPOSAL_NOT_FOUND };
    }
    if (proposal.expired) {
      return { ok: false, value: this.ERR_PROPOSAL_EXPIRED };
    }
    proposal.expired = true;
    return { ok: true, value: true };
  }

  getCampaignDetails(campaignId: number): ClarityResponse<Campaign | undefined> {
    return { ok: true, value: this.state.campaigns.get(campaignId) };
  }

  getProposalDetails(campaignId: number, proposalId: number): ClarityResponse<Proposal | undefined> {
    const key = `${campaignId}-${proposalId}`;
    return { ok: true, value: this.state.proposals.get(key) };
  }

  getVoteDetails(campaignId: number, proposalId: number, voter: string): ClarityResponse<Vote | undefined> {
    const key = `${campaignId}-${proposalId}-${voter}`;
    return { ok: true, value: this.state.votes.get(key) };
  }

  getDelegation(campaignId: number, delegator: string): ClarityResponse<Delegation | undefined> {
    const key = `${campaignId}-${delegator}`;
    return { ok: true, value: this.state.delegations.get(key) };
  }

  getVoterAllowance(campaignId: number, voter: string): ClarityResponse<number> {
    const key = `${campaignId}-${voter}`;
    return { ok: true, value: this.state.voterAllowances.get(key)?.remainingTokens ?? 0 };
  }

  isVotingActive(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.votingActive };
  }

  getVotingEndBlock(): ClarityResponse<number> {
    return { ok: true, value: this.state.votingEndBlock };
  }

  getWinningProposal(campaignId: number): ClarityResponse<WinningProposal> {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign) {
      return { ok: false, value: this.ERR_INVALID_CAMPAIGN };
    }
    if (this.state.votingActive) {
      return { ok: false, value: this.ERR_TALLY_NOT_READY };
    }
    let maxVotes = 0;
    let winningId = 0;
    for (let propId = 1; propId <= campaign.proposalCount; propId++) {
      const key = `${campaignId}-${propId}`;
      const proposal = this.state.proposals.get(key);
      if (proposal) {
        const votes = this.state.quadraticVotingEnabled ? proposal.quadraticTotal : proposal.totalVotes;
        if (votes > maxVotes) {
          maxVotes = votes;
          winningId = propId;
        }
      }
    }
    return { ok: true, value: { maxVotes, winningId } };
  }
}

// Test setup
const accounts = {
  organizer: "organizer",
  voter1: "voter1",
  voter2: "voter2",
  delegatee: "delegatee",
};

describe("VotingMechanism Contract", () => {
  let contract: VotingMechanismMock;

  beforeEach(() => {
    contract = new VotingMechanismMock();
    vi.resetAllMocks();
  });

  it("should initialize a new campaign correctly", () => {
    const init = contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    expect(init).toEqual({ ok: true, value: true });

    const details = contract.getCampaignDetails(1);
    expect(details.ok).toBe(true);
    expect(details.value).toEqual(expect.objectContaining({ organizer: accounts.organizer, votingPeriod: 200, active: true }));
  });

  it("should prevent non-organizer from initializing campaign", () => {
    const init = contract.initializeCampaign(accounts.voter1, 1, 200, accounts.organizer);
    expect(init).toEqual({ ok: false, value: 100 });
  });

  it("should start voting for a campaign", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    const start = contract.startVoting(accounts.organizer, 1);
    expect(start).toEqual({ ok: true, value: true });
    expect(contract.isVotingActive()).toEqual({ ok: true, value: true });
  });

  it("should allow submitting a proposal during active voting", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    const submit = contract.submitProposal(accounts.voter1, 1, "Allocate to charity", 50, accounts.voter2);
    expect(submit.ok).toBe(true);
    expect(submit.value).toBe(1);

    const details = contract.getProposalDetails(1, 1);
    expect(details.value).toEqual(expect.objectContaining({ description: "Allocate to charity", allocationPercentage: 50 }));
  });

  it("should allow voting on a proposal", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    contract.submitProposal(accounts.voter1, 1, "Test proposal", 50, accounts.voter2);

    const vote = contract.vote(accounts.voter1, 1, 1, 500);
    expect(vote).toEqual({ ok: true, value: true });

    const voteDetails = contract.getVoteDetails(1, 1, accounts.voter1);
    expect(voteDetails.value).toEqual(expect.objectContaining({ weight: 500 }));

    const propDetails = contract.getProposalDetails(1, 1);
    expect(propDetails.value?.totalVotes).toBe(500);
    expect(propDetails.value?.quadraticTotal).toBe(500 ** 2);
  });

  it("should prevent voting after end", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    contract.submitProposal(accounts.voter1, 1, "Test", 50, accounts.voter2);
    contract.advanceBlock(201);

    const vote = contract.vote(accounts.voter1, 1, 1, 500);
    expect(vote).toEqual({ ok: false, value: 102 });
  });

  it("should allow delegation and revocation", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);

    const delegate = contract.delegateVote(accounts.voter1, 1, accounts.delegatee);
    expect(delegate).toEqual({ ok: true, value: true });

    const delDetails = contract.getDelegation(1, accounts.voter1);
    expect(delDetails.value).toEqual({ delegatee: accounts.delegatee });

    const revoke = contract.revokeDelegation(accounts.voter1, 1);
    expect(revoke).toEqual({ ok: true, value: true });
    expect(contract.getDelegation(1, accounts.voter1).value).toBeUndefined();
  });

  it("should determine winning proposal after voting ends", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    contract.submitProposal(accounts.voter1, 1, "Prop1", 50, accounts.voter2);
    contract.submitProposal(accounts.voter1, 1, "Prop2", 50, accounts.voter2);
    contract.vote(accounts.voter1, 1, 1, 300);
    contract.vote(accounts.voter2, 1, 2, 500);
    contract.endVoting(accounts.organizer, 1);

    const winning = contract.getWinningProposal(1);
    expect(winning.ok).toBe(true);
    expect(winning.value).toEqual({ maxVotes: 500 ** 2, winningId: 2 });
  });

  it("should pause and unpause voting", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);

    const pause = contract.pauseVoting(accounts.organizer, 1);
    expect(pause).toEqual({ ok: true, value: true });

    const submitDuringPause = contract.submitProposal(accounts.voter1, 1, "Paused prop", 50, accounts.voter2);
    expect(submitDuringPause).toEqual({ ok: false, value: 116 });

    const unpause = contract.unpauseVoting(accounts.organizer, 1);
    expect(unpause).toEqual({ ok: true, value: true });

    const submitAfter = contract.submitProposal(accounts.voter1, 1, "Unpaused prop", 50, accounts.voter2);
    expect(submitAfter.ok).toBe(true);
  });

  it("should expire a proposal", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    contract.submitProposal(accounts.voter1, 1, "To expire", 50,accounts.voter2);

    const expire = contract.expireProposal(accounts.organizer, 1, 1);
    expect(expire).toEqual({ ok: true, value: true });

    const voteOnExpired = contract.vote(accounts.voter1, 1, 1, 500);
    expect(voteOnExpired).toEqual({ ok: false, value: 109 });
  });

  it("should enforce allowance on multiple votes", () => {
    contract.initializeCampaign(accounts.organizer, 1, 200, accounts.organizer);
    contract.startVoting(accounts.organizer, 1);
    contract.submitProposal(accounts.voter1, 1, "Prop1", 50, accounts.voter2);
    contract.submitProposal(accounts.voter1, 1, "Prop2", 50, accounts.voter2);

    contract.vote(accounts.voter1, 1, 1, 600);
    const secondVote = contract.vote(accounts.voter1, 1, 2, 500);
    expect(secondVote).toEqual({ ok: false, value: 112 }); // 1000 - 600 = 400 < 500
  });
});